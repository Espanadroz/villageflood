import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'jsdom', globals: true, setupFiles: ['./tests/setup.ts'], include: ['src/**/*.test.{ts,tsx}', 'poller/src/**/*.test.ts', 'tests/**/*.test.ts'], exclude: ['tests/db/**', 'node_modules/**'] },
});
