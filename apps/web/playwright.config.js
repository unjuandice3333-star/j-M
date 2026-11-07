// Playwright de J&M FASHION STORE (M36). Dos destinos, mismo conjunto de pruebas:
//   E2E_TARGET=local    (por defecto) Vite + backend SINTÉTICO local (solo Node; funciona en Windows sin Docker).
//   E2E_TARGET=preview  Vercel Preview ya desplegado (BASE_URL), conectado a Supabase QA. Pruebas de solo lectura.
// Navegadores: proyecto `edge` (Microsoft Edge instalado, channel msedge; el del propietario) y `chromium` (CI).
// Reportes: HTML en apps/web/playwright-report (nunca se abre solo). Fallos: captura, vídeo y traza.
// Sin secretos en este archivo: el bypass de Deployment Protection de Vercel se lee de VERCEL_AUTOMATION_BYPASS_SECRET.
import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const TARGET = (process.env.E2E_TARGET || 'local').toLowerCase();
if (!['local', 'preview'].includes(TARGET)) throw new Error(`E2E_TARGET inválido: "${TARGET}" (use local o preview)`);

const WEB_PORT = Number(process.env.E2E_PORT || 3110);
const API_PORT = Number(process.env.E2E_API_PORT || 54321);

let baseURL;
const extraHTTPHeaders = {};
let webServer;
if (TARGET === 'preview') {
  baseURL = process.env.BASE_URL;
  if (!baseURL || !/^https:\/\//.test(baseURL)) throw new Error('E2E_TARGET=preview exige BASE_URL con https:// (la URL del Preview de Vercel)');
  // Deployment Protection se mantiene ACTIVA: se usa el secreto de «Protection Bypass for Automation» (no se desactiva nada).
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    extraHTTPHeaders['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    extraHTTPHeaders['x-vercel-set-bypass-cookie'] = 'true';
  }
} else {
  baseURL = `http://127.0.0.1:${WEB_PORT}`;
  // Variables del fixture público de CI (config/env/local-ci.env: valores ficticios, no son credenciales).
  const ci = {};
  for (const l of readFileSync(path.join(ROOT, 'config/env/local-ci.env'), 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(l.trim());
    if (m) ci[m[1]] = m[2];
  }
  webServer = [
    { // backend sintético en memoria (apps/web/e2e/synthetic/backend.cjs)
      command: 'node e2e/synthetic/backend.cjs',
      url: `http://127.0.0.1:${API_PORT}/__health`,
      env: { PORT: String(API_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    { // Vite real de la tienda apuntando al backend sintético
      command: `node node_modules/vite/bin/vite.js --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
      url: baseURL,
      env: ci,
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
    },
  ];
}

export default defineConfig({
  testDir: './e2e/playwright',
  testMatch: /.*\.spec\.js$/,
  outputDir: './test-results',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // el backend sintético es de estado compartido
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    extraHTTPHeaders,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer,
  metadata: { target: TARGET, baseURL },
});
