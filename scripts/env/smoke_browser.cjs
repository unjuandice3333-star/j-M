// M26-T5 — Comprobación en navegador (Chromium headless vía Playwright) de que la app arranca contra el stack local.
// Uso: node scripts/env/smoke_browser.cjs <url-de-la-app> <url-de-supabase>
// Imprime un JSON: errores de configuración, si renderiza y las respuestas recibidas del stack local (solo estado HTTP).
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('ERROR: Playwright no está disponible (instálelo o exporte NODE_PATH con su ubicación)'); process.exit(2);
}
(async () => {
  const [appUrl, supabaseUrl] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = []; const supabase = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.url().startsWith(supabaseUrl)) supabase.push({ path: new URL(r.url()).pathname, status: r.status() }); });
  await page.goto(appUrl, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const rendered = await page.evaluate(() => (document.getElementById('root')?.innerHTML.length ?? 0) > 0);
  await browser.close();
  const configErrors = errors.filter((e) => /Configuración del cliente|ConfigError/.test(e)).map((e) => e.split('\n')[0]);
  // Entorno correcto = la app contacta el stack local y este acepta la llave (sin 401/403) y responde (sin 5xx).
  // Los 4xx de esquema (p. ej. una columna que el frontend espera y la BD no tiene) son defectos de la APLICACIÓN:
  // se informan como aviso, con su ruta y estado, pero no invalidan el entorno generado.
  const authOrServerErrors = supabase.filter((r) => r.status === 401 || r.status === 403 || r.status >= 500);
  const appSchemaErrors = supabase.filter((r) => r.status >= 400 && r.status < 500 && r.status !== 401 && r.status !== 403);
  console.log(JSON.stringify({ rendered, configErrors, supabaseResponses: supabase.length,
    responses: supabase.map((r) => `${r.status} ${r.path}`).slice(0, 10),
    authOrServerErrors: authOrServerErrors.length, appSchemaErrors: appSchemaErrors.length }));
  if (appSchemaErrors.length) console.log('AVISO: la aplicación recibió errores 4xx de esquema del stack local (defecto de la app, no del entorno)');
  process.exit(rendered && configErrors.length === 0 && supabase.length > 0 && authOrServerErrors.length === 0 ? 0 : 1);
})();
