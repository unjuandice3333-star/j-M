import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'node', include: ['apps/web/tests/**/*.test.js', 'packages/**/*.test.ts'], exclude: ['**/node_modules/**'] },
});
