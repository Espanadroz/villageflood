import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../data/supabase';

// Client-side check is UX only: every admin write is enforced server-side by RLS / RPC (is_committee()).
export function useCommittee() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [isCommittee, setIsCommittee] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user ?? null;
      setEmail(user?.email ?? null);
      if (user) {
        const { data: rows } = await supabase.from('committee_members').select('user_id').eq('user_id', user.id);
        setIsCommittee((rows?.length ?? 0) > 0);
      } else setIsCommittee(false);
    } catch {
      setIsCommittee(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { refresh(); });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  return {
    loading, email, isCommittee,
    signIn: async (addr: string) => { const { error } = await supabase.auth.signInWithOtp({ email: addr, options: { emailRedirectTo: `${location.origin}/admin`, shouldCreateUser: false } }); if (error) throw error; },
    signOut: async () => { await supabase.auth.signOut(); },
  };
}
