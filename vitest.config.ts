import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { env: { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'test-anon-key' }, environment: 'jsdom', globals: true, setupFiles: ['./tests/setup.ts'], include: ['src/**/*.test.{ts,tsx}', 'poller/src/**/*.test.ts', 'tests/**/*.test.ts'], exclude: ['tests/db/**', 'node_modules/**'] },
});
