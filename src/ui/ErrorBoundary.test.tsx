import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { DISCLAIMER_TH } from '../core/config';
import { ErrorBoundary, lazyRetry } from './ErrorBoundary';
import { Layout } from './Layout';

vi.mock('./components/OfflineBanner', () => ({ OfflineBanner: () => null }));
const FALLBACK = 'โหลดหน้านี้ไม่สำเร็จ — อาจเป็นเพราะอินเทอร์เน็ตไม่เสถียร';
let broken = true;
const Bomb = () => { if (broken) throw new Error('boom'); return <p>ok page</p>; };

beforeEach(() => { broken = true; vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

function inLayout(el: React.ReactNode) {
  return render(<MemoryRouter><Routes><Route element={<Layout />}><Route index element={el} /></Route></Routes></MemoryRouter>);
}

it('shows the Thai fallback with the disclaimer still visible when a page throws, and retry recovers', async () => {
  inLayout(<Bomb />);
  expect(screen.getByText(FALLBACK)).toBeInTheDocument();
  expect(screen.getByText(DISCLAIMER_TH)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'โหลดหน้าใหม่' })).toBeInTheDocument();
  broken = false;
  await userEvent.click(screen.getByRole('button', { name: 'ลองอีกครั้ง' }));
  expect(screen.getByText('ok page')).toBeInTheDocument();
  expect(screen.getByText(DISCLAIMER_TH)).toBeInTheDocument();
});

it('lazyRetry: a factory that rejects once then resolves renders after retry', async () => {
  let calls = 0;
  const Page = lazyRetry(async () => { if (++calls === 1) throw new Error('chunk failed'); return { default: () => <p>lazy ok</p> }; });
  render(<ErrorBoundary><Suspense fallback={<p>loading</p>}><Page /></Suspense></ErrorBoundary>);
  expect(await screen.findByText(FALLBACK)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'ลองอีกครั้ง' }));
  expect(await screen.findByText('lazy ok')).toBeInTheDocument();
  expect(calls).toBe(2);
});
