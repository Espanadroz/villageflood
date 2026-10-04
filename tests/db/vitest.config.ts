import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
export default defineConfig(({ mode }) => ({
  test: { environment: 'node', globals: true, setupFiles: ['tests/db/setup.ts'], include: ['tests/db/**/*.int.test.ts'], env: loadEnv(mode, process.cwd(), '') },
}));
