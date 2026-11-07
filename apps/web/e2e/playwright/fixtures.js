// Fixtures comunes (M36): registran la consola del navegador y los fallos de red de cada prueba y los adjuntan al
// informe HTML; las excepciones no controladas de la página hacen fallar la prueba.
import { test as base, expect } from '@playwright/test';
import { isSupabaseApi, entryFromResponse, formatEntry } from './supabaseDiagnostics.js';

// Ruido esperado que no es un defecto de la tienda (p. ej. analítica o el widget de pago no disponibles en pruebas).
const IGNORED_CONSOLE = [/Download the React DevTools/i, /React Router Future Flag/i, /\[vite\]/i, /favicon/i];
const IGNORED_REQUESTS = [/wompi/i, /google-analytics|googletagmanager|facebook\.net|connect\.facebook/i, /fonts\.(googleapis|gstatic)/i, /images\.unsplash\.com/i];

export const test = base.extend({
  diagnostics: [async ({ page }, use, testInfo) => {
    const consoleLog = []; const network = []; const pageErrors = [];
    const supabase = []; // todas las respuestas de la API de Supabase (estado, tabla/RPC y, si falló, código y mensaje)
    page.on('console', (m) => {
      const t = m.text();
      if (IGNORED_CONSOLE.some((re) => re.test(t))) return;
      consoleLog.push(`[${m.type()}] ${t}`);
    });
    page.on('pageerror', (e) => pageErrors.push(`${e.name}: ${e.message}`));
    page.on('requestfailed', (r) => {
      if (IGNORED_REQUESTS.some((re) => re.test(r.url()))) return;
      network.push(`FALLÓ ${r.method()} ${r.url()} — ${r.failure()?.errorText ?? ''}`);
    });
    page.on('response', async (r) => {
      if (isSupabaseApi(r.url())) {
        let bodyText = '';
        if (r.status() >= 400) { try { bodyText = await r.text(); } catch { /* cuerpo no disponible */ } }
        supabase.push(entryFromResponse({ url: r.url(), method: r.request().method(), status: r.status(), bodyText }));
      }
      if (r.status() < 400 || IGNORED_REQUESTS.some((re) => re.test(r.url()))) return;
      network.push(`${r.status()} ${r.request().method()} ${r.url()}`);
    });
    await use({ consoleLog, network, pageErrors, supabase });
    if (consoleLog.length) await testInfo.attach('console.log', { body: consoleLog.join('\n'), contentType: 'text/plain' });
    if (network.length) await testInfo.attach('network-errors.log', { body: network.join('\n'), contentType: 'text/plain' });
    const failed = supabase.filter((e) => e.status >= 400);
    if (failed.length) {
      await testInfo.attach('supabase-errors.json', { body: JSON.stringify(failed, null, 2), contentType: 'application/json' });
      testInfo.annotations.push({ type: 'supabase', description: failed.map(formatEntry).join(' || ') });
    }
    if (pageErrors.length) await testInfo.attach('page-errors.log', { body: pageErrors.join('\n'), contentType: 'text/plain' });
    expect(pageErrors, 'excepciones no controladas en la página').toEqual([]);
  }, { auto: true }],
});

export { expect };
