import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['apps/web/tests/**/*.test.js', 'packages/**/*.test.ts'], environment: 'node' },
});
