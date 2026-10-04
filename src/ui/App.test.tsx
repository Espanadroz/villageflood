import { render, screen } from '@testing-library/react';
import { GateView } from './App';
import { DISCLAIMER_TH } from '../core/config';

const base = { snapshot: null, loading: false, error: null, reload: () => {} };
it('shows the disclaimer while loading', () => {
  render(<GateView {...base} loading><p>x</p></GateView>);
  expect(screen.getByText(DISCLAIMER_TH)).toBeInTheDocument();
});
it('shows the disclaimer on the error screen', () => {
  render(<GateView {...base} error={new Error('boom')}><p>x</p></GateView>);
  expect(screen.getByText(DISCLAIMER_TH)).toBeInTheDocument();
});
it('keeps queued reports visible on the loading and error screens', async () => {
  const { OutboxProvider } = await import('../state/OutboxContext');
  const { act } = await import('@testing-library/react');
  const box = { pending: async () => [{}], failed: async () => [], flush: async () => ({}), retryFailed: async () => {}, dismissFailed: async () => {} };
  render(<OutboxProvider box={box} intervalMs={60_000}><GateView {...base} error={new Error('boom')}><p>x</p></GateView></OutboxProvider>);
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  expect(screen.getByText(/มี 1 รายงานยังไม่ได้ส่ง/)).toBeInTheDocument();
});
