import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { OutboxProvider, useOutboxStatus } from './OutboxContext';

vi.mock('./outbox', () => ({ outbox: {} }));
function Show() { const s = useOutboxStatus(); return <p>p{s.pendingCount} f{s.failedCount}</p>; }

it('swallows flush rejections (no unhandled rejection) and still reports counts', async () => {
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const box = { pending: vi.fn().mockResolvedValue([1, 2]), failed: vi.fn().mockResolvedValue([1]), flush: vi.fn().mockRejectedValue(new Error('offline')), retryFailed: vi.fn(), dismissFailed: vi.fn() };
  render(<OutboxProvider box={box}><Show /></OutboxProvider>);
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  expect(screen.getByText('p2 f1')).toBeInTheDocument();
  expect(warn).toHaveBeenCalled();
  await act(async () => { window.dispatchEvent(new Event('online')); await new Promise((r) => setTimeout(r, 20)); });
  expect(box.flush.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(unhandled).not.toHaveBeenCalled();
  process.off('unhandledRejection', unhandled);
  warn.mockRestore();
});
it('flushes on interval', async () => {
  vi.useFakeTimers();
  const box = { pending: vi.fn().mockResolvedValue([]), failed: vi.fn().mockResolvedValue([]), flush: vi.fn().mockResolvedValue({}), retryFailed: vi.fn(), dismissFailed: vi.fn() };
  render(<OutboxProvider box={box} intervalMs={1000}><Show /></OutboxProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
  expect(box.flush.mock.calls.length).toBeGreaterThanOrEqual(3);
  vi.useRealTimers();
});
