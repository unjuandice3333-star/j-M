// M28 — Lista de deseos persistida en wishlist_items. Navegador real contra el stack LOCAL.
// Fusión de la lista anónima al iniciar sesión, sincronización entre dos dispositivos, sin duplicados, limpieza al
// cerrar sesión y aislamiento entre clientes (RLS).
const { chromium } = require('playwright');
const { st, setPassword, CLIENTE1_ID } = require('./lib_local.cjs');
const CLIENTE2_ID = '00000000-0000-4000-8000-00000000a004';
const B = 'http://localhost:3000';
let fails = 0; const ok = (c, m) => { console.log(`${c ? '  ✔' : '  ✘'} ${m}`); if (!c) fails++; };
const rest = (path, init = {}, token = st.ANON_KEY) => fetch(`${st.API_URL}${path}`, { ...init, headers: { apikey: st.ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
const svc = (path, init = {}) => rest(path, init, st.SERVICE_ROLE_KEY);
async function tokenFor(email, pwd) {
  const r = await fetch(`${st.API_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: st.ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pwd }) });
  return (await r.json()).access_token;
}
const dbList = async (uid) => (await (await svc(`/rest/v1/wishlist_items?user_id=eq.${uid}&select=product_id`)).json()).map((r) => r.product_id);
async function login(p, email, pwd) {
  await p.goto(B + '/cuenta', { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', email); await p.fill('input[type=password]', pwd);
  await p.getByRole('button', { name: /^Iniciar sesión$/ }).click();
  await p.getByText(/cerrar sesión/i).first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(1500);
}
const heart = (p, name) => p.locator(`button[aria-label$=": ${name}"][aria-pressed]`).first();
const favCount = async (p) => { await p.goto(B + '/cuenta/favoritos', { waitUntil: 'networkidle' }); await p.waitForTimeout(800); return Number((await p.locator('h1').innerText()).match(/\((\d+)\)/)?.[1]); };

(async () => {
  const products = await (await rest('/rest/v1/products?status=eq.active&select=id,name&order=name')).json();
  const [P1, P2, P3] = products;
  const before = await dbList(CLIENTE1_ID);
  ok(before.length === 0, `cliente1 empieza sin favoritos en la BD (${before.length})`);
  const pwd1 = await setPassword(CLIENTE1_ID);
  const browser = await chromium.launch(); const errs = [];
  const mk = async (vp) => { const c = await browser.newContext({ viewport: vp }); const p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message)); return p; };

  console.log('▶ dispositivo A (escritorio): favoritos sin sesión y luego iniciar sesión');
  const a = await mk({ width: 1400, height: 900 });
  await a.goto(B + '/ropa', { waitUntil: 'networkidle' });
  await heart(a, P1.name).click(); await heart(a, P2.name).click(); await a.waitForTimeout(500);
  ok((await dbList(CLIENTE1_ID)).length === 0, 'sin sesión: nada se escribe en la BD');
  ok(await favCount(a) === 2, 'sin sesión: 2 favoritos en este navegador');
  await login(a, 'cliente1@qa.jm.test', pwd1);
  let db = await dbList(CLIENTE1_ID);
  ok(db.length === 2 && db.includes(P1.id) && db.includes(P2.id), `al iniciar sesión la lista anónima se fusiona en la BD (${db.length})`);

  console.log('▶ dispositivo B (móvil): misma cuenta');
  const b = await mk({ width: 390, height: 844 });
  await b.goto(B + '/ropa', { waitUntil: 'networkidle' }); await heart(b, P1.name).click(); // P1 ya está en la cuenta ⇒ no debe duplicarse
  await login(b, 'cliente1@qa.jm.test', pwd1);
  db = await dbList(CLIENTE1_ID);
  ok(db.length === 2, `fusión con un producto repetido no crea duplicados (${db.length} filas)`);
  ok(await favCount(b) === 2, 'B ve los 2 favoritos guardados desde A');
  await b.goto(B + '/ropa', { waitUntil: 'networkidle' });
  await heart(b, P3.name).click(); await b.waitForTimeout(800);
  await heart(b, P2.name).click(); await b.waitForTimeout(800);   // quitar P2 desde el móvil
  db = await dbList(CLIENTE1_ID);
  ok(db.length === 2 && db.includes(P3.id) && !db.includes(P2.id), 'B añade P3 y quita P2 en la BD');

  console.log('▶ A se actualiza al volver a la pestaña');
  await a.goto(B + '/ropa', { waitUntil: 'networkidle' });
  await a.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await a.waitForTimeout(1200);
  ok(await heart(a, P3.name).getAttribute('aria-pressed') === 'true' && await heart(a, P2.name).getAttribute('aria-pressed') === 'false', 'A refleja los cambios hechos en B');
  ok(await favCount(a) === 2, 'A muestra 2 favoritos');

  console.log('▶ duplicados directos y aislamiento entre clientes (RLS)');
  const tok1 = await tokenFor('cliente1@qa.jm.test', pwd1);
  const dup = await rest('/rest/v1/wishlist_items', { method: 'POST', body: JSON.stringify({ user_id: CLIENTE1_ID, product_id: P1.id }) }, tok1);
  ok(dup.status === 409, `insertar el mismo producto dos veces → 409 (clave primaria) (HTTP ${dup.status})`);
  const tok2 = await tokenFor('cliente2@qa.jm.test', await setPassword(CLIENTE2_ID));
  const seen = await (await rest(`/rest/v1/wishlist_items?user_id=eq.${CLIENTE1_ID}&select=product_id`, {}, tok2)).json();
  ok(Array.isArray(seen) && seen.length === 0, 'cliente2 no ve la lista de cliente1');
  const forge = await rest('/rest/v1/wishlist_items', { method: 'POST', body: JSON.stringify({ user_id: CLIENTE1_ID, product_id: P2.id }) }, tok2);
  ok(forge.status === 403, `cliente2 no puede escribir en la lista de cliente1 (HTTP ${forge.status})`);
  const del = await rest(`/rest/v1/wishlist_items?user_id=eq.${CLIENTE1_ID}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } }, tok2);
  ok((await del.json()).length === 0 && (await dbList(CLIENTE1_ID)).length === 2, 'cliente2 no puede borrar la lista de cliente1');
  const anon = await (await rest(`/rest/v1/wishlist_items?select=product_id`)).json();
  ok(Array.isArray(anon) ? anon.length === 0 : true, 'anónimo no ve filas');

  console.log('▶ cerrar sesión en A borra la copia local');
  await a.goto(B + '/cuenta', { waitUntil: 'networkidle' }); await a.getByText(/cerrar sesión/i).first().click(); await a.waitForTimeout(1500);
  ok(await favCount(a) === 0, 'tras cerrar sesión A no muestra la lista del cliente');
  const ls = await a.evaluate(() => localStorage.getItem('jm-fashion-store-cart-v14'));
  ok(!ls.includes(P3.id) && !ls.includes(P1.id), 'localStorage sin los ids del cliente');
  ok((await dbList(CLIENTE1_ID)).length === 2, 'la lista sigue en la cuenta');

  console.log('▶ limpieza: B quita los favoritos desde la interfaz');
  await b.goto(B + '/ropa', { waitUntil: 'networkidle' });
  for (const P of [P1, P3]) { await heart(b, P.name).click(); await b.waitForTimeout(700); }
  ok((await dbList(CLIENTE1_ID)).length === 0, 'cuenta vuelve a 0 favoritos');

  ok(errs.length === 0, `sin errores de página (${errs.join(' | ').slice(0, 200)})`);
  await browser.close();
  console.log(fails ? `RESULTADO: ${fails} FALLO(S)` : 'RESULTADO: PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR', e.message); process.exit(2); });
