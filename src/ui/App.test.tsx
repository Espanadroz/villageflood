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
