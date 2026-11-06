// M28 — Imágenes de portada persistidas (site_content + Storage `site-content`). Navegador real contra el stack LOCAL.
// Comprueba: subida por el admin, persistencia tras recarga y cierre de sesión, visible desde OTRO navegador (contexto
// nuevo, sin localStorage), cliente sin permisos (RLS/Storage) y restauración.
const { chromium } = require('playwright');
const { st, setPassword, ADMIN_ID, CLIENTE1_ID, tinyPng } = require('./lib_local.cjs');
const B = 'http://localhost:3000';
const PNG = require('path').join(require('os').tmpdir(), 'jm-e2e-hero.png'); require('fs').writeFileSync(PNG, tinyPng());
let fails = 0; const ok = (c, m) => { console.log(`${c ? '  ✔' : '  ✘'} ${m}`); if (!c) fails++; };
const rest = (path, init = {}, token = st.ANON_KEY) => fetch(`${st.API_URL}${path}`, { ...init, headers: { apikey: st.ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
async function tokenFor(email, pwd) {
  const r = await fetch(`${st.API_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: st.ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pwd }) });
  return (await r.json()).access_token;
}
const heroBg = (p) => p.locator('[role=img]').first().evaluate((el) => getComputedStyle(el).backgroundImage);

(async () => {
  const adminPwd = await setPassword(ADMIN_ID);
  const browser = await chromium.launch();
  const errs = [];
  const ctxA = await browser.newContext({ viewport: { width: 1400, height: 900 } }); const a = await ctxA.newPage();
  a.on('pageerror', (e) => errs.push(e.message));

  console.log('▶ admin cambia el Hero subiendo una imagen');
  await a.goto(B + '/admin/login', { waitUntil: 'networkidle' });
  await a.fill('input[type=email]', 'admin@qa.jm.test'); await a.fill('input[type=password]', adminPwd);
  await a.locator('form button[type=submit]').first().click(); await a.waitForURL(/\/admin\/dashboard/, { timeout: 15000 });
  await a.goto(B + '/admin/imagenes', { waitUntil: 'networkidle' });
  const card = a.locator('[data-key=hero_main]');
  const seed = (await (await rest('/rest/v1/site_content?key=eq.hero_main&select=image_url,alt_text')).json())[0] || null;
  console.log('  fila inicial del Hero:', seed ? 'existe (seed)' : 'no existe');
  await card.getByRole('button', { name: /Cambiar imagen/ }).click();
  await a.setInputFiles('input[aria-label="Subir imagen"]', PNG);
  await a.waitForFunction(() => document.querySelector('[role=dialog] img')?.src.includes('/site-content/library/'), null, { timeout: 10000 });
  await a.fill('[role=dialog] label:has-text("Texto alternativo") input', 'Hero E2E M28');
  await a.getByRole('button', { name: 'Guardar y publicar' }).click();
  await a.getByRole('status').filter({ hasText: 'Imagen guardada' }).waitFor({ timeout: 10000 });
  ok(await card.getByText('PERSONALIZADA').count() === 1, 'tarjeta marcada como PERSONALIZADA');

  const row = await (await rest('/rest/v1/site_content?key=eq.hero_main&select=storage_path,image_url,alt_text,updated_by')).json();
  ok(row[0]?.storage_path?.startsWith('library/') && row[0].image_url === null, `fila en site_content con archivo de Storage (${row[0]?.storage_path})`);
  ok(row[0]?.updated_by === ADMIN_ID, 'updated_by = administrador');
  const pub = await fetch(`${st.API_URL}/storage/v1/object/public/site-content/${row[0].storage_path}`);
  ok(pub.status === 200, `archivo público accesible (HTTP ${pub.status})`);
  const ls = await a.evaluate(() => JSON.stringify(localStorage));
  ok(!ls.includes('data:image') && !ls.includes('editorialImages'), 'nada de la portada guardado en localStorage');

  console.log('▶ persistencia: recarga y cierre de sesión');
  await a.reload({ waitUntil: 'networkidle' });
  ok(await a.locator('[data-key=hero_main]').getByText('PERSONALIZADA').count() === 1, 'tras recargar sigue PERSONALIZADA');
  await a.goto(B + '/', { waitUntil: 'networkidle' });
  ok((await heroBg(a)).includes(row[0].storage_path), 'la portada del admin muestra la nueva imagen');
  await a.evaluate(async () => { const { default: s } = await import('/src/config/supabase.js'); await s.auth.signOut(); });
  await a.reload({ waitUntil: 'networkidle' });
  ok((await heroBg(a)).includes(row[0].storage_path), 'tras cerrar sesión la portada conserva la imagen');

  console.log('▶ otro navegador (contexto nuevo, anónimo, móvil)');
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } }); const b = await ctxB.newPage();
  await b.goto(B + '/', { waitUntil: 'networkidle' });
  ok((await heroBg(b)).includes(row[0].storage_path), 'visitante anónimo en otro navegador ve la nueva imagen');
  ok(await b.locator('[role=img][aria-label="Hero E2E M28"]').count() === 1, 'texto alternativo desde la BD');

  console.log('▶ permisos: un cliente no puede modificar contenido ni subir archivos');
  const custTok = await tokenFor('cliente1@qa.jm.test', await setPassword(CLIENTE1_ID));
  const up = await rest('/rest/v1/site_content?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: 'hero_main', image_url: 'https://evil.example/x.jpg' }) }, custTok);
  ok(up.status === 401 || up.status === 403, `upsert de cliente rechazado (HTTP ${up.status})`);
  const del = await rest('/rest/v1/site_content?key=eq.hero_main', { method: 'DELETE', headers: { Prefer: 'return=representation' } }, custTok);
  ok((await del.json()).length === 0, 'borrado de cliente no afecta filas');
  const anonUp = await rest('/rest/v1/site_content', { method: 'POST', body: JSON.stringify({ key: 'x_anon', image_url: 'https://evil.example/x.jpg' }) });
  ok(anonUp.status === 401 || anonUp.status === 403, `inserción anónima rechazada (HTTP ${anonUp.status})`);
  const stUp = await fetch(`${st.API_URL}/storage/v1/object/site-content/library/evil.png`, { method: 'POST', headers: { apikey: st.ANON_KEY, Authorization: `Bearer ${custTok}`, 'Content-Type': 'image/png' }, body: tinyPng() });
  ok(stUp.status >= 400, `subida a Storage por cliente rechazada (HTTP ${stUp.status})`);
  const still = await (await rest('/rest/v1/site_content?key=eq.hero_main&select=storage_path')).json();
  ok(still[0]?.storage_path === row[0].storage_path, 'el contenido sigue intacto');

  console.log('▶ un cliente que entra a /admin/imagenes no ve el editor');
  await b.goto(B + '/admin/imagenes', { waitUntil: 'networkidle' });
  ok(!/\/admin\/imagenes/.test(b.url()) || await b.getByRole('button', { name: /Cambiar imagen/ }).count() === 0, `anónimo redirigido (${b.url().replace(B, '')})`);

  console.log('▶ volver a entrar como admin');
  await a.goto(B + '/admin/login', { waitUntil: 'networkidle' });
  await a.fill('input[type=email]', 'admin@qa.jm.test'); await a.fill('input[type=password]', adminPwd);
  await a.locator('form button[type=submit]').first().click(); await a.waitForURL(/\/admin\/dashboard/, { timeout: 15000 });
  await a.goto(B + '/admin/imagenes', { waitUntil: 'networkidle' });

  console.log('▶ otra clave desde la biblioteca y «Restaurar»');
  const sc = a.locator('[data-key=style_urbana]');
  ok(await sc.getByText('ORIGINAL').count() === 1, 'Línea Urbana empieza en ORIGINAL');
  await sc.getByRole('button', { name: /Cambiar imagen/ }).click();
  await a.locator(`[role=dialog] button[aria-label^="Usar "]`).first().click();
  await a.getByRole('button', { name: 'Guardar y publicar' }).click();
  await a.getByRole('status').filter({ hasText: 'Imagen guardada' }).waitFor({ timeout: 10000 });
  ok((await (await rest('/rest/v1/site_content?key=eq.style_urbana&select=storage_path')).json())[0]?.storage_path?.startsWith('library/'), 'imagen elegida de la biblioteca guardada');
  await sc.getByRole('button', { name: /Restaurar imagen/ }).click();
  await a.getByRole('dialog', { name: 'Confirmar restauración' }).getByRole('button', { name: 'Restaurar' }).click();
  await a.getByRole('status').filter({ hasText: 'imagen original' }).waitFor({ timeout: 10000 });
  ok((await (await rest('/rest/v1/site_content?key=eq.style_urbana&select=key')).json()).length === 0, 'Restaurar elimina la fila (imagen del diseño)');
  ok(await sc.getByText('ORIGINAL').count() === 1, 'tarjeta vuelve a ORIGINAL');

  console.log('▶ Hero vuelve a su valor inicial por URL https (deja la BD como estaba)');
  if (seed) {
    await a.locator('[data-key=hero_main]').getByRole('button', { name: /Cambiar imagen/ }).click();
    await a.fill('[role=dialog] input[placeholder="https://…"]', seed.image_url);
    await a.fill('[role=dialog] label:has-text("Texto alternativo") input', seed.alt_text || '');
    await a.getByRole('button', { name: 'Guardar y publicar' }).click();
    await a.getByRole('status').filter({ hasText: 'Imagen guardada' }).waitFor({ timeout: 10000 });
    const back = (await (await rest('/rest/v1/site_content?key=eq.hero_main&select=image_url,storage_path')).json())[0];
    ok(back?.image_url === seed.image_url && back.storage_path === null, 'Hero restaurado a la URL inicial');
    const bad = a.locator('[data-key=hero_main]');
    await bad.getByRole('button', { name: /Cambiar imagen/ }).click();
    await a.fill('[role=dialog] input[placeholder="https://…"]', 'http://inseguro.example/x.jpg');
    await a.getByRole('button', { name: 'Guardar y publicar' }).click();
    ok(await a.locator('[role=dialog] [role=alert]').filter({ hasText: 'https://' }).count() === 1, 'URL no https rechazada con mensaje');
    await a.getByRole('button', { name: 'Cancelar' }).click();
  }
  await a.getByRole('button', { name: 'Biblioteca' }).click();
  ok(await a.locator('figure img[src*="/site-content/library/"]').count() >= 1, 'la imagen subida sigue en la biblioteca');
  await b.goto(B + '/', { waitUntil: 'networkidle' });
  ok(!(await heroBg(b)).includes('site-content'), 'el otro navegador ve de nuevo el Hero inicial');

  ok(errs.length === 0, `sin errores de página (${errs.join(' | ').slice(0, 200)})`);
  await browser.close();
  console.log(fails ? `RESULTADO: ${fails} FALLO(S)` : 'RESULTADO: PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR', e.message); process.exit(2); });
