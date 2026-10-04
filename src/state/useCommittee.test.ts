import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
vi.mock('../data/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithOtp: (...a: unknown[]) => signInWithOtp(...a),
    },
  },
}));
import { useCommittee } from './useCommittee';

it('never creates new auth users from the login form (members are invited first)', async () => {
  const { result } = renderHook(() => useCommittee());
  await act(async () => { await result.current.signIn('a@example.test'); });
  expect(signInWithOtp.mock.calls[0]![0]).toMatchObject({ email: 'a@example.test', options: { shouldCreateUser: false } });
});
