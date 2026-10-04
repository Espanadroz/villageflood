export function assertSupabaseEnv(url: unknown, key: unknown): { url: string; key: string } {
  if (typeof url !== 'string' || !url.trim() || typeof key !== 'string' || !key.trim()) {
    throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — see README');
  }
  return { url, key };
}
