// M28 — Sesiones: rutas protegidas, recuperación (renovación del token), expiración (sesión revocada/vencida) y
// expiración durante el checkout. Navegador real contra el stack LOCAL.
// La expiración se provoca de forma controlada: (a) marcando el token de este navegador como vencido (expires_at en el
// pasado) para que supabase-js lo renueve, y (b) revocando todas las sesiones del usuario en el GoTrue LOCAL
// (logout global desde "otro dispositivo"), que invalida el refresh token: es lo que ocurre al vencer la sesión.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const { st, setPassword, CLIENTE1_ID } = require('./lib_local.cjs');
const B = 'http://localhost:3000';
let fails = 0; const ok = (c, m) => { console.log(`${c ? '  ✔' : '  ✘'} ${m}`); if (!c) fails++; };
const sql = (q) => execFileSync('psql', [st.DB_URL, '-Atc', q], { encoding: 'utf8' }).trim();
const KEY = 'sb-127-auth-token';
async function tokenFor(email, pwd) {
  const r = await fetch(`${st.API_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: st.ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pwd }) });
  return (await r.json()).access_token;
}
const revokeAll = async (email, pwd) => {   // "otro dispositivo" cierra todas las sesiones
  const t = await tokenFor(email, pwd);
  const r = await fetch(`${st.API_URL}/auth/v1/logout?scope=global`, { method: 'POST', headers: { apikey: st.ANON_KEY, Authorization: `Bearer ${t}` } });
  return r.status;
};
const expireLocal = (p) => p.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.expires_at = Math.floor(Date.now() / 1000) - 60; localStorage.setItem(k, JSON.stringify(s)); return s.access_token; }, KEY);
const session = (p) => p.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
async function login(p, email, pwd) {
  await p.goto(B + '/cuenta', { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', email); await p.fill('input[type=password]', pwd);
  await p.getByRole('button', { name: /^Iniciar sesión$/ }).click();
  await p.getByText(/cerrar sesión/i).first().waitFor({ timeout: 15000 });
}
const loggedIn = async (p) => (await p.getByText(/cerrar sesión/i).count()) > 0;

(async () => {
  const email = 'cliente1@qa.jm.test'; const pwd = await setPassword(CLIENTE1_ID);
  const browser = await chromium.launch(); const errs = [];
  const mk = async () => { const p = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); p.on('pageerror', (e) => errs.push(e.message)); return p; };

  console.log('▶ rutas protegidas');
  const anon = await mk();
  for (const path of ['/admin/dashboard', '/admin/pedidos', '/admin/imagenes']) {
    await anon.goto(B + path, { waitUntil: 'networkidle' });
    ok(anon.url().endsWith('/admin/login'), `anónimo en ${path} → /admin/login`);
  }
  await anon.goto(B + '/cuenta/pedidos', { waitUntil: 'networkidle' });
  ok(await anon.getByRole('button', { name: /^Iniciar sesión$/ }).count() === 1 && await anon.getByText(/JM-0/).count() === 0, '/cuenta/pedidos sin sesión muestra el acceso, no pedidos');
  const cust = await mk(); await login(cust, email, pwd);
  await cust.goto(B + '/admin/dashboard', { waitUntil: 'networkidle' });
  ok(cust.url().endsWith('/admin/login') && await cust.getByText(/no tiene permisos administrativos/i).count() === 1, 'cliente en /admin → /admin/login con «sin permisos»');

  console.log('▶ recuperación: token vencido con refresh token válido → se renueva solo');
  await cust.goto(B + '/cuenta/pedidos', { waitUntil: 'networkidle' });
  const oldTok = await expireLocal(cust);
  await cust.reload({ waitUntil: 'networkidle' }); await cust.waitForTimeout(1500);
  const s1 = await session(cust);
  ok(s1 && s1.access_token !== oldTok && s1.expires_at * 1000 > Date.now(), 'el token se renovó (nuevo access_token, expiración futura)');
  ok(await loggedIn(cust), 'el cliente sigue con sesión y ve su cuenta');

  console.log('▶ expiración real: sesión revocada desde otro dispositivo + token vencido');
  ok(await revokeAll(email, pwd) === 204, 'logout global (otro dispositivo) → 204');
  await cust.evaluate(() => { /* el carrito debe sobrevivir a la expiración */ });
  await expireLocal(cust);
  await cust.reload({ waitUntil: 'networkidle' }); await cust.waitForTimeout(2000);
  ok(!(await loggedIn(cust)) && await cust.getByRole('button', { name: /^Iniciar sesión$/ }).count() === 1, 'la tienda detecta la sesión vencida y pide iniciar sesión');
  ok(await session(cust) === null, 'el token vencido se elimina del navegador');
  await login(cust, email, pwd);
  ok(await loggedIn(cust), 'volver a iniciar sesión funciona');

  console.log('▶ expiración DURANTE el checkout');
  const before = Number(sql(`select count(*) from online_orders where customer_email='${email}'`));
  const c = await mk(); await login(c, email, pwd);
  await c.goto(B + '/producto/jean-slim-selvedge', { waitUntil: 'networkidle' });
  await c.locator('#size-selector-container button[aria-label^="Talla"]:not([disabled])').first().click();
  await c.getByRole('button', { name: 'AGREGAR AL CARRITO', exact: true }).first().click();
  await c.goto(B + '/checkout', { waitUntil: 'networkidle' }); await c.waitForTimeout(1500);
  ok(await c.inputValue('input[name=email]') === email, 'checkout precargado con los datos del cliente');
  await c.fill('input[name=phone]', '3109876543'); await c.selectOption('select[name=department]', 'Bogotá D.C.');
  await c.fill('input[name=city]', 'Bogotá'); await c.fill('input[name=address]', 'Calle 100 # 15-20');
  // la sesión vence mientras el cliente llena el formulario
  await revokeAll(email, pwd); await expireLocal(c);
  await c.getByRole('button', { name: /CONFIRMAR Y PAGAR/ }).click(); await c.waitForTimeout(3000);
  const after = Number(sql(`select count(*) from online_orders where customer_email='${email}'`));
  const guest = Number(sql(`select count(*) from online_orders where customer_email='${email}' and user_id is null`));
  const alert = await c.getByRole('alert').allInnerTexts();
  console.log('  resultado:', { pedidosNuevos: after - before, pedidosSinCuenta: guest, url: c.url().replace(B, ''), alerta: alert.join(' | ').slice(0, 160) });
  ok(after === before, 'no se crea un pedido «huérfano» (sin cuenta) cuando la sesión venció');
  ok(alert.some((t) => /sesión/i.test(t)), 'el cliente recibe un aviso claro de sesión vencida');
  const items = await c.evaluate(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14')).state.items.length);
  ok(items === 1 && await c.inputValue('input[name=address]') === 'Calle 100 # 15-20', 'el carrito y los datos del formulario se conservan');
  console.log('▶ reingresar desde el aviso y completar el pedido');
  await c.getByRole('link', { name: 'Iniciar sesión' }).click();
  await c.fill('input[type=email]', email); await c.fill('input[type=password]', pwd);
  await c.getByRole('button', { name: /^Iniciar sesión$/ }).click();
  await c.waitForURL(/\/checkout$/, { timeout: 15000 }).catch(() => {});
  ok(c.url().endsWith('/checkout'), 'tras iniciar sesión vuelve al checkout');
  await c.waitForTimeout(1500);
  ok(await c.inputValue('input[name=address]') === 'Calle 100 # 15-20' && await c.inputValue('input[name=email]') === email, 'la dirección escrita y el correo siguen en el formulario');
  await c.getByRole('button', { name: /CONFIRMAR Y PAGAR/ }).click();
  await c.waitForURL(/checkout\/confirmacion/, { timeout: 20000 }).catch(() => {});
  const num = new URL(c.url()).searchParams.get('order');
  const own = num && sql(`select user_id from online_orders where order_number='${num}'`);
  ok(own === CLIENTE1_ID, `pedido ${num} creado y asociado a la cuenta del cliente`);
  ok(await c.evaluate(() => sessionStorage.getItem('jm-checkout-draft')) === null, 'el borrador del formulario se borra al crear el pedido');
  if (num) { // liberar la reserva de stock del pedido de prueba
    const tok = new URL(c.url()).searchParams.get('token');
    const id = sql(`select id from online_orders where order_number='${num}'`);
    await fetch(`${st.API_URL}/rest/v1/rpc/cancel_my_order`, { method: 'POST', headers: { apikey: st.ANON_KEY, Authorization: `Bearer ${st.ANON_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_order_id: id, p_public_token: tok, p_reason: 'E2E M28 sesiones' }) });
  }

  ok(errs.length === 0, `sin errores de página (${errs.join(' | ').slice(0, 200)})`);
  await browser.close();
  console.log(fails ? `RESULTADO: ${fails} FALLO(S)` : 'RESULTADO: PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR', e.message); process.exit(2); });
