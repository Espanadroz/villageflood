import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

let truncated = true;
vi.mock('../state/SnapshotContext', () => {
  const ctx = () => ({ snapshot: { statusTruncated: truncated, fetchedAt: 1, serverOffsetMs: 0 }, error: null, now: 1, reload: vi.fn() });
  return { useData: ctx, useOptionalData: ctx };
});
vi.mock('../state/OutboxContext', () => ({ useOutboxStatus: () => ({ pendingCount: 0, failedCount: 0, failed: [] }) }));
import { Routes, Route } from 'react-router-dom';
import { Layout } from './Layout';

const open = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route element={<Layout />}><Route path="*" element={<p>page</p>} /></Route></Routes>
  </MemoryRouter>,
);

it.each(['/routes', '/supply', '/', '/map'])('shows the truncation warning app-wide (%s)', (path) => {
  truncated = true;
  open(path);
  expect(screen.getByText('ข้อมูลรายงานมีมากเกินไป สถานะอาจไม่ครบ — โปรดแจ้งกรรมการ')).toBeInTheDocument();
});
it('no warning when complete', () => {
  truncated = false;
  open('/routes');
  expect(screen.queryByText(/ข้อมูลรายงานมีมากเกินไป/)).not.toBeInTheDocument();
});
