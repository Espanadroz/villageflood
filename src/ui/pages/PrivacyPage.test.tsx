import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PrivacyPage } from './PrivacyPage';

it('states what is collected, the 30-day retention, the controller and how to request deletion', () => {
  render(<MemoryRouter><PrivacyPage /></MemoryRouter>);
  expect(screen.getByText(/30 วัน/)).toBeInTheDocument();
  expect(screen.getByText(/กรรมการหมู่บ้าน/)).toBeInTheDocument();
  expect(screen.getByText(/ขอลบ/)).toBeInTheDocument();
  expect(screen.getByText(/ข้อมูลชุมชน ไม่ใช่ประกาศเตือนภัยทางการ/)).toBeInTheDocument();
});
