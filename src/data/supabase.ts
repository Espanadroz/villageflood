import { createClient } from '@supabase/supabase-js';
import { assertSupabaseEnv } from './env';

const { url, key } = assertSupabaseEnv(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
export const supabase = createClient(url, key);
export const mediaUrl = (path: string) => `${url}/storage/v1/object/public/evidence/${path}`;
