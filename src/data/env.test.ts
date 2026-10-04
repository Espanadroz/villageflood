import { describe, it, expect } from 'vitest';
import { assertSupabaseEnv } from './env';

describe('assertSupabaseEnv', () => {
  it('accepts both set', () => {
    expect(() => assertSupabaseEnv('http://x', 'k')).not.toThrow();
  });
  it('throws when url missing', () => {
    expect(() => assertSupabaseEnv(undefined, 'k')).toThrow(/Missing VITE_SUPABASE_URL/);
  });
  it('throws when key missing', () => {
    expect(() => assertSupabaseEnv('http://x', undefined)).toThrow(/VITE_SUPABASE_ANON_KEY/);
  });
  it('throws on empty strings', () => {
    expect(() => assertSupabaseEnv('', 'k')).toThrow();
    expect(() => assertSupabaseEnv('http://x', '  ')).toThrow();
  });
});
