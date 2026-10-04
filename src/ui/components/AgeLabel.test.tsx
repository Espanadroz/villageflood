import { render, screen } from '@testing-library/react';
import { AgeLabel } from './AgeLabel';

const NOW = 1_000_000_000_000;
it('shows the age in Thai', () => {
  render(<AgeLabel at={NOW - 5 * 60_000} now={NOW} />);
  expect(screen.getByText('อัปเดต 5 นาทีที่แล้ว')).toBeInTheDocument();
});
it('marks data older than the limit as old', () => {
  render(<AgeLabel at={NOW - 2 * 3_600_000} now={NOW} maxAgeMs={3_600_000} />);
  expect(screen.getByText(/ข้อมูลเก่า/)).toBeInTheDocument();
});
it('says there is no data instead of a time when missing', () => {
  render(<AgeLabel at={null} now={NOW} />);
  expect(screen.getByText('ไม่มีข้อมูล')).toBeInTheDocument();
});
it('treats non-finite times as no data', () => {
  const { rerender } = render(<AgeLabel at={NaN} now={NOW} />);
  expect(screen.getByText('ไม่มีข้อมูล')).toBeInTheDocument();
  rerender(<AgeLabel at={undefined as unknown as number} now={NOW} />);
  expect(screen.getByText('ไม่มีข้อมูล')).toBeInTheDocument();
});
