import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

const row = { id: 'r1', kind: 'road', target_id: 's', value: 'dry', nickname: 'n', device_id: 'dddddddd-0000', created_at: new Date().toISOString(),
  location_ok: true, media_path: 'kkkk/r1.jpg', note: null, confirmed_by_committee: false, by_committee: false, deleted: false };
const rpc = vi.fn();
const remove = vi.fn();
function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'update']) q[m] = () => q;
  (q as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return q;
}
vi.mock('../../../data/supabase', () => ({
  mediaUrl: (p: string) => `https://x/${p}`,
  supabase: {
    from: (t: string) => (t === 'reports' ? query({ data: [row], error: null }) : query({ data: [], error: null })),
    rpc: (...a: unknown[]) => rpc(...a),
    storage: { from: (b: string) => ({ remove: (paths: string[]) => remove(b, paths) }) },
  },
}));
import { ModerationList } from './ModerationList';

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ error: null });
  remove.mockReset().mockResolvedValue({ data: [{ name: 'kkkk/r1.jpg' }], error: null });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

const del = async () => {
  render(<ModerationList now={Date.now()} />);
  await userEvent.click(await screen.findByRole('button', { name: 'ลบ' }));
};

it('removes the evidence object after a successful delete', async () => {
  await del();
  await waitFor(() => expect(remove).toHaveBeenCalledWith('evidence', ['kkkk/r1.jpg']));
  expect(rpc).toHaveBeenCalledWith('moderate_report', { p_report: 'r1', p_action: 'delete' });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('does not touch storage when the delete RPC fails', async () => {
  rpc.mockResolvedValue({ error: { message: 'committee_only' } });
  await del();
  expect(await screen.findByRole('alert')).toHaveTextContent('committee_only');
  expect(remove).not.toHaveBeenCalled();
});
it('shows an error when the storage removal fails', async () => {
  remove.mockResolvedValue({ data: null, error: { message: 'boom' } });
  await del();
  expect(await screen.findByRole('alert')).toHaveTextContent('ลบรายงานแล้ว แต่ลบไฟล์หลักฐานไม่สำเร็จ');
});
it('treats an empty removal result (RLS filtered) as a failure', async () => {
  remove.mockResolvedValue({ data: [], error: null });
  await del();
  expect(await screen.findByRole('alert')).toHaveTextContent('ลบรายงานแล้ว แต่ลบไฟล์หลักฐานไม่สำเร็จ');
});
