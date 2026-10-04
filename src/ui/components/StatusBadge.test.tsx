import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';

it('always shows a Thai text label, not just colour', () => {
  render(<StatusBadge state="small_car" />);
  expect(screen.getByText('รถเล็กไปได้')).toBeInTheDocument();
});
it('renders unknown distinctly from dry', () => {
  const { container } = render(<StatusBadge state="unknown" />);
  expect(screen.getByText('ไม่ทราบ')).toBeInTheDocument();
  expect(container.querySelector('.badge--unknown')).not.toBeNull();
  expect(container.querySelector('.badge--dry')).toBeNull();
});
it('shows the conflict note', () => {
  render(<StatusBadge state="impassable" conflict />);
  expect(screen.getByText('มีรายงานขัดแย้ง')).toBeInTheDocument();
});
