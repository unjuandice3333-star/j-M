// ESLint 9 (flat config) — J&M FASHION STORE (M25)
// Política: los ERRORES bloquean la integración (CI). Las advertencias se reportan y se
// reducen progresivamente; no bloquean para no ocultar deuda existente bajo exclusiones.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-ssr/**',
      'apps/web/public/**',
      'supabase/**',            // SQL / Deno: validados por pgTAP y deno test
      'ci-artifacts/**',
      '**/playwright-report/**',   // artefactos generados por Playwright (M36.2.1), no código fuente
      '**/test-results/**',
      '**/.auth/**',
      '**/*.min.js',
      '**/*.d.ts',
      'packages/shared/index.js' // artefacto compilado de index.ts
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Sin eslint-plugin-react, los componentes usados solo en JSX parecen no usados:
      // se ignoran identificadores en mayúscula inicial (componentes) y los prefijados con _.
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'react-hooks/exhaustive-deps': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
      // D77: los iconos pasan por apps/web/src/components/Common/icons.js (decorativos por defecto, aria-hidden).
      'no-restricted-imports': ['error', { paths: [{ name: 'lucide-react', message: 'Importa los iconos desde components/Common/icons.js (aria-hidden por defecto).' }] }],
    },
  },
];
