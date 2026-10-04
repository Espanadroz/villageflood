import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { OutboxProvider } from '../../state/OutboxContext';
import { OutboxBanner } from './OutboxBanner';
import type { FailedItem } from '../../data/outbox';

vi.mock('../../state/outbox', () => ({ outbox: {} }));

const failedItem = (id: string, reason: string, kind: 'road' | 'water_level' = 'road', ageMs = 2 * 3_600_000): FailedItem => ({
  reason,
  item: { id, createdAt: Date.now() - ageMs, attempts: 0, blob: null, mediaType: null,
    draft: { deviceId: 'd', nickname: 'n', kind, targetId: 't', value: 'impassable', lat: null, lng: null, note: null } },
});

function makeBox(pending: unknown[], failed: FailedItem[]) {
  const state = { pending: [...pending], failed: [...failed] };
  return {
    state,
    pending: vi.fn(async () => state.pending),
    failed: vi.fn(async () => state.failed),
    flush: vi.fn(async () => ({ sent: 0, failed: 0, stoppedOnRetry: false })),
    retryFailed: vi.fn(async (id: string) => { const f = state.failed.find((x) => x.item.id === id); state.failed = state.failed.filter((x) => x.item.id !== id); if (f) state.pending.push(f.item); }),
    dismissFailed: vi.fn(async (id: string) => { state.failed = state.failed.filter((x) => x.item.id !== id); }),
  };
}
const show = async (box: ReturnType<typeof makeBox>) => {
  const r = render(<OutboxProvider box={box} intervalMs={60_000}><OutboxBanner /></OutboxProvider>);
  await act(async () => { await new Promise((res) => setTimeout(res, 20)); });
  return r;
};

beforeEach(() => { vi.spyOn(window, 'confirm').mockReturnValue(true); });

it('renders nothing when there is nothing pending or failed', async () => {
  const { container } = await show(makeBox([], []));
  expect(container).toBeEmptyDOMElement();
});

it('shows the pending count app-wide', async () => {
  await show(makeBox([{ id: 'a' }, { id: 'b' }], []));
  expect(screen.getByText('มี 2 รายงานยังไม่ได้ส่ง — จะส่งให้อัตโนมัติเมื่อมีอินเทอร์เน็ต')).toBeInTheDocument();
});

it('lists each failed item with kind, Thai reason and age, and retries it', async () => {
  const box = makeBox([], [failedItem('x', 'report_too_old'), failedItem('y', 'device_blocked', 'water_level', 30 * 60_000)]);
  await show(box);
  const items = screen.getAllByRole('listitem');
  expect(items).toHaveLength(2);
  expect(items[0]).toHaveTextContent('สภาพถนน');
  expect(items[0]).toHaveTextContent('รายงานเก่าเกินไป กรุณาถ่ายใหม่แล้วส่งอีกครั้ง');
  expect(items[0]).toHaveTextContent('2 ชั่วโมงที่แล้ว');
  expect(items[1]).toHaveTextContent('ระดับน้ำ');
  expect(items[1]).toHaveTextContent('ถูกระงับ');
  expect(items[1]).toHaveTextContent('30 นาทีที่แล้ว');
  await userEvent.click(screen.getAllByRole('button', { name: 'ส่งอีกครั้ง' })[0]!);
  await waitFor(() => expect(box.retryFailed).toHaveBeenCalledWith('x'));
  await waitFor(() => expect(box.flush.mock.invocationCallOrder.at(-1)!).toBeGreaterThan(box.retryFailed.mock.invocationCallOrder[0]!));
  await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
  expect(screen.getByText(/มี 1 รายงานยังไม่ได้ส่ง/)).toBeInTheDocument();
});

it('dismisses a failed item after confirmation and refreshes the list', async () => {
  const box = makeBox([], [failedItem('x', 'invalid_value')]);
  await show(box);
  await userEvent.click(screen.getByRole('button', { name: 'ลบออก' }));
  await waitFor(() => expect(box.dismissFailed).toHaveBeenCalledWith('x'));
  await waitFor(() => expect(screen.queryByRole('listitem')).not.toBeInTheDocument());
});

it('does not dismiss when the confirmation is cancelled', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  const box = makeBox([], [failedItem('x', 'invalid_value')]);
  await show(box);
  await userEvent.click(screen.getByRole('button', { name: 'ลบออก' }));
  expect(box.dismissFailed).not.toHaveBeenCalled();
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
});

it('shows an error when an action fails', async () => {
  const box = makeBox([], [failedItem('x', 'invalid_value')]);
  box.retryFailed.mockRejectedValueOnce(new Error('idb broken'));
  await show(box);
  await userEvent.click(screen.getByRole('button', { name: 'ส่งอีกครั้ง' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('idb broken');
});
