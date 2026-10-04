import { render, screen } from '@testing-library/react';
import { TruncatedBanner } from './TruncatedBanner';

it('shows a persistent warning when the status fetch was truncated', () => {
  render(<TruncatedBanner truncated />);
  expect(screen.getByRole('alert')).toHaveTextContent('ข้อมูลรายงานมีมากเกินไป สถานะอาจไม่ครบ — โปรดแจ้งกรรมการ');
});
it('renders nothing otherwise', () => {
  const { container } = render(<TruncatedBanner truncated={false} />);
  expect(container).toBeEmptyDOMElement();
});
