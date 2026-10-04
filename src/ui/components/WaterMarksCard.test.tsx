import { render, screen, within } from '@testing-library/react';
import type { Resolved } from '../../core/types';
import type { MarkRow } from '../../data/types';
import { WaterMarksCard } from './WaterMarksCard';

const NOW = 1_800_000_000_000;
const levels = [{ level: 1, label: 'ขีดที่ 1 (ตาตุ่ม)' }, { level: 2, label: 'ขีดที่ 2 (เข่า)' }];
const mark = (id: string, name: string): MarkRow => ({ id, name, geojson: { type: 'Point', coordinates: [0, 0] }, levels });
const marks = [mark('m1', 'กำแพงหน้าหมู่บ้าน'), mark('m2', 'ประตูระบายน้ำ'), mark('m3', 'ศาลา')];
const states: Record<string, Resolved<string>> = {
  m1: { value: '2', asOf: NOW - 20 * 60_000, conflict: false, basisReportId: 'r1' },
  m2: { value: 'unknown', asOf: null, conflict: false, basisReportId: null },
  m3: { value: '1', asOf: NOW - 5 * 60_000, conflict: true, basisReportId: 'r3' },
};

it('shows each mark with its current level label and age', () => {
  render(<WaterMarksCard marks={marks} states={states} now={NOW} />);
  expect(screen.getByRole('heading', { name: 'ระดับน้ำที่จุดวัด' })).toBeInTheDocument();
  const m1 = screen.getByText('กำแพงหน้าหมู่บ้าน').closest('li')!;
  expect(m1).toHaveTextContent('ขีดที่ 2 (เข่า)');
  expect(m1).toHaveTextContent('20 นาทีที่แล้ว');
  expect(m1).not.toHaveTextContent('ขัดแย้ง');
});
it('shows ไม่ทราบ for an expired/unknown mark, never a level', () => {
  render(<WaterMarksCard marks={marks} states={states} now={NOW} />);
  const m2 = screen.getByText('ประตูระบายน้ำ').closest('li')!;
  expect(within(m2).getByText('ไม่ทราบ')).toBeInTheDocument();
  expect(m2).not.toHaveTextContent('ขีดที่');
  expect(m2).toHaveTextContent('ไม่มีข้อมูล');
});
it('shows the conflict note as text', () => {
  render(<WaterMarksCard marks={marks} states={states} now={NOW} />);
  const m3 = screen.getByText('ศาลา').closest('li')!;
  expect(m3).toHaveTextContent('ขีดที่ 1 (ตาตุ่ม)');
  expect(m3).toHaveTextContent('มีรายงานขัดแย้ง — แสดงระดับที่สูงกว่า');
});
it('treats a missing state as unknown and an unlisted level number as its number', () => {
  render(<WaterMarksCard marks={[mark('m4', 'จุดใหม่'), mark('m5', 'จุดแปลก')]} states={{ m5: { value: '7', asOf: NOW, conflict: false, basisReportId: 'x' } }} now={NOW} />);
  expect(screen.getByText('จุดใหม่').closest('li')!).toHaveTextContent('ไม่ทราบ');
  expect(screen.getByText('จุดแปลก').closest('li')!).toHaveTextContent('ขีดที่ 7');
});
it('says so when no marks are configured', () => {
  render(<WaterMarksCard marks={[]} states={{}} now={NOW} />);
  expect(screen.getByText('ยังไม่มีจุดวัดระดับน้ำในระบบ')).toBeInTheDocument();
});
