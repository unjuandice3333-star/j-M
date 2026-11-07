// Salud del destino, en pasos SEPARADOS (M36.1) para que un fallo diga qué capa está mal antes de mirar el catálogo:
//   [1] aplicación accesible · [2] bypass de Vercel correcto · [3] carga de datos de Supabase.
// Después, smoke.spec.js ([4] catálogo, producto y carrito) mantiene sus 7 pruebas originales sin cambios.
import { test, expect } from './fixtures.js';
import { BYPASS_HEADER_NAMES, isDeploymentUrl } from './vercelBypass.js';
import { formatEntry } from './supabaseDiagnostics.js';

const isPreview = (process.env.E2E_TARGET || 'local') === 'preview';
test.describe.configure({ mode: 'serial' });

test.describe('salud · capas del destino', () => {
  test('[1] aplicación accesible (HTTP 200, HTML de la tienda y no la pantalla de Vercel)', async ({ page, baseURL }) => {
    const res = await page.goto('/');
    expect(res, 'sin respuesta del destino').toBeTruthy();
    expect(res.status(), `HTTP ${res.status()} en ${baseURL}`).toBe(200);
    const title = await page.title();
    expect(title, 'se cargó la pantalla de autenticación de Vercel, no la tienda').not.toMatch(/Vercel|Authentication|Log in/i);
    await expect(page.locator('#root')).toBeAttached();
    await expect(page.getByText('J&M FASHION STORE').first()).toBeVisible();
  });

  test('[2] bypass de Vercel correcto: sin cabeceras de bypass hacia terceros', async ({ page, baseURL }) => {
    test.skip(!isPreview, 'solo aplica al destino preview (el local no usa Deployment Protection)');
    const leaked = []; const hosts = new Set();
    page.on('request', async (r) => {
      const h = await r.allHeaders();
      if (!isDeploymentUrl(r.url(), baseURL)) hosts.add(new URL(r.url()).host);
      if (!isDeploymentUrl(r.url(), baseURL) && BYPASS_HEADER_NAMES.some((n) => n in h)) leaked.push(new URL(r.url()).host);
    });
    await page.goto('/ropa');
    await page.waitForLoadState('networkidle').catch(() => {});
    expect(leaked, `cabeceras de bypass enviadas a terceros: ${[...new Set(leaked)].join(', ')}`).toEqual([]);
    expect(await page.title()).not.toMatch(/Vercel|Authentication/i);
  });

  test('[3] datos de Supabase: home, catálogo y producto sin respuestas HTTP ≥ 400', async ({ page, diagnostics }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.goto('/ropa');
    await page.waitForLoadState('networkidle').catch(() => {});
    const first = page.locator('a[href^="/producto/"]').first();
    if (await first.count()) { await first.click(); await page.waitForLoadState('networkidle').catch(() => {}); }
    const seen = diagnostics.supabase;
    expect(seen.length, 'la tienda no hizo ninguna petición a la API de Supabase (¿variables VITE_SUPABASE_* del deployment?)').toBeGreaterThan(0);
    const failed = seen.filter((e) => e.status >= 400);
    const counts = new Map(); for (const e of failed) { const k = formatEntry(e); counts.set(k, (counts.get(k) ?? 0) + 1); }
    const lines = [...counts].map(([k, n]) => (n > 1 ? `${k}  (×${n})` : k));
    expect(lines, `Supabase respondió con errores en ${failed.length} petición(es) (${lines.length} distintas)`).toEqual([]);
  });
});
