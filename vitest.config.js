import { defineConfig } from 'vitest/config'

// Vitest solo ejecuta las pruebas unitarias TypeScript/JS de los paquetes.
// Los archivos *.test.mjs de scripts/ usan node:test y se ejecutan con `pnpm test:env`.
export default defineConfig({
  test: {
    include: ['packages/**/*.test.{ts,tsx,js}', 'apps/web/src/**/*.test.{ts,tsx,js,jsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'scripts/**'],
  },
})
