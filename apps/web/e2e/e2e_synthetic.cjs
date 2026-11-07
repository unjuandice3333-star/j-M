// E2E de navegador SIN Docker (M33): Vite real + Chromium real contra un backend sintético en memoria
// (e2e/synthetic/backend.cjs). Solo se emula la dependencia externa (Supabase); Wompi NO está conectado:
// el pago no se simula como real (ver recorrido 6). Uso:  node apps/web/e2e/e2e_synthetic.cjs
// Salida con código 1 si falla algún recorrido. Solo escucha en 127.0.0.1.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const backend = require('./synthetic/backend.cjs');

const ROOT = path.resolve(__dirname, '../../..');
const WEB = path.join(ROOT, 'apps/web');
const API = 54321; const APP = Number(process.env.E2E_PORT || 3100);
const BASE = `http://127.0.0.1:${APP}`; const API_URL = `http://127.0.0.1:${API}`;

// Variables del fixture público de CI (config/env/local-ci.env: valores ficticios, no son credenciales).
function ciEnv() {
  const out = {};
  for (const l of fs.readFileSync(path.join(ROOT, 'config/env/local-ci.env'), 'utf8').split('\n')) { const m = /^([A-Z_]+)=(.*)$/.exec(l.trim()); if (m) out[m[1]] = m[2]; }
  return out;
}
const j = (r) => r.json();
const reset = () => fetch(`${API_URL}/__reset`).then(j);
const state = () => fetch(`${API_URL}/__state`).then(j);

const results = [];
async function journey(name, fn, browser, allowConsole = null) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) return;
  await reset();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('dialog', (d) => d.accept().catch(() => {})); // confirmaciones nativas de la interfaz
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|wompi|\/api\/wompi|net::ERR/i.test(m.text()) && !(allowConsole && allowConsole.test(m.text()))) problems.push(`console.error: ${m.text().slice(0, 160)}`); });
  if (process.env.E2E_DEBUG) { page.on('framenavigated', (f) => console.log('   nav', f.url())); page.on('dialog', (d) => console.log('   dialog', d.message().slice(0, 50))); }
  const t0 = Date.now(); let ok = true; let detail = '';
  try { await fn(page, ctx); } catch (e) { ok = false; detail = String(e.message).split('\n')[0]; await page.screenshot({ path: path.join(WEB, 'e2e', `fail-${name.replace(/\W+/g, '_')}.png`) }).catch(() => {}); }
  if (ok && problems.length) { ok = false; detail = `errores de consola/página: ${problems.slice(0, 2).join(' · ')}`; }
  results.push({ name, ok, ms: Date.now() - t0, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`);
  await ctx.close();
}

const expectText = async (page, text, timeout = 8000) => page.getByText(text, { exact: false }).first().waitFor({ timeout });
async function addToCart(page, slug, size, color) {
  await page.goto(`${BASE}/producto/${slug}`);
  if (color) await page.getByRole('button', { name: `Color ${color}` }).click();
  await page.getByRole('button', { name: `Talla ${size}`, exact: true }).click();
  await page.getByRole('button', { name: 'AGREGAR AL CARRITO' }).first().click();
}
async function fillCheckout(page, over = {}) {
  const f = { firstName: 'Juan', lastName: 'Pérez', email: 'juan@correo.co', phone: '3001234567', city: 'Medellín', address: 'Calle 10 # 5-20', ...over };
  for (const k of ['firstName', 'lastName', 'email', 'phone', 'city', 'address']) { await page.locator(`input[name=${k}]`).fill(f[k]); }
  await page.locator('select[name=department]').selectOption({ label: 'Antioquia' });
}
const login = async (page, url, email, password, submit) => {
  await page.goto(`${BASE}${url}`);
  await page.locator('input[type=email]').fill(email); await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: submit }).click();
};

async function main() {
  const be = await backend.start(API);
  const env = { ...process.env, ...ciEnv() };
  const vite = spawn(path.join(WEB, 'node_modules/.bin/vite'), ['--port', String(APP), '--host', '127.0.0.1', '--strictPort'], { cwd: WEB, env, stdio: 'ignore' });
  const stop = async () => { vite.kill(); await be.close(); };
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* arrancando */ } await new Promise((r) => setTimeout(r, 500)); }
    const browser = await chromium.launch();

    await journey('1. Catálogo: navegación y filtro por categoría', async (p) => {
      await p.goto(`${BASE}/ropa`);
      await expectText(p, 'MOSTRANDO 2 PRENDAS');
      await p.getByText('Camiseta Básica').first().waitFor(); await p.getByText('Polo Clásico').first().waitFor();
      await p.getByText('Camisetas (2)').first().click();
      await p.getByText('Camiseta Básica').first().click();
      await p.waitForURL(/\/producto\/camiseta-basica/);
    }, browser);

    await journey('2. Producto: precio, talla, color y disponibilidad', async (p) => {
      await p.goto(`${BASE}/producto/camiseta-basica`);
      await expectText(p, '$80.000');
      await p.getByRole('button', { name: 'Color Blanco' }).click();
      await expectText(p, 'COLOR: Blanco');
      // Blanco/M está agotado (0 en stock): no se puede agregar
      const agotada = p.getByRole('button', { name: 'Talla M agotada' });
      await agotada.waitFor();
      if (!(await agotada.isDisabled())) throw new Error('la talla agotada se puede seleccionar');
      // Negro/M sí
      await p.getByRole('button', { name: 'Color Negro' }).click();
      await p.getByRole('button', { name: 'Talla M', exact: true }).click();
      await p.getByRole('button', { name: 'AGREGAR AL CARRITO' }).first().click();
      await p.waitForFunction(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14') || '{"state":{"items":[]}}').state.items.length === 1);
    }, browser);

    await journey('3. Carrito: cantidades, límite de stock, persistencia y eliminación', async (p) => {
      await addToCart(p, 'camiseta-basica', 'L', 'Negro'); // L/Negro: solo 1 en stock
      await p.goto(`${BASE}/carrito`);
      await expectText(p, 'CARRITO DE COMPRAS (1)');
      await p.getByRole('button', { name: /Aumentar cantidad/ }).first().click();
      await expectText(p, 'Solo hay 1');
      await p.reload();
      await expectText(p, 'CARRITO DE COMPRAS (1)'); // persistencia tras recargar
      await p.getByRole('button', { name: /Eliminar/ }).first().click();
      await expectText(p, 'actualmente vacío');
    }, browser);

    await journey('4. Cupón y envío: totales de la BD', async (p) => {
      await addToCart(p, 'polo-clasico', 'M'); // 120.000
      await p.goto(`${BASE}/carrito`);
      await expectText(p, '$132.000'); // + envío 12.000
      await p.getByRole('button', { name: /Aumentar cantidad/ }).first().click(); // 240.000 → envío gratis
      await expectText(p, '$240.000');
      await p.getByPlaceholder(/cup[oó]n|c[oó]digo/i).first().fill('JM10');
      await p.getByRole('button', { name: 'APLICAR' }).click();
      await expectText(p, 'JM10');
      await expectText(p, '$216.000'); // 240.000 - 10%
      await p.reload();
      await expectText(p, '$216.000');
    }, browser);

    await journey('5. Checkout: validación y creación de pedido con reserva de stock', async (p) => {
      await addToCart(p, 'camiseta-basica', 'M', 'Negro');
      await p.goto(`${BASE}/checkout`);
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await expectText(p, 'Escribe tu nombre'); // validación en el navegador
      await fillCheckout(p);
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/, { timeout: 15000 });
      const st = await state();
      if (st.orders.length !== 1) throw new Error(`pedidos creados: ${st.orders.length} (se esperaba 1)`);
      const o = st.orders[0];
      if (o.total !== 92000) throw new Error(`total del pedido ${o.total} ≠ 92000 (80.000 + 12.000 envío)`);
      if (o.status !== 'payment_pending') throw new Error(`estado ${o.status}`);
      const reserved = st.inventories.find((i) => i.sku === 'CAM-M-NEG').reserved;
      if (reserved !== 1) throw new Error(`stock reservado ${reserved} ≠ 1`);
      // El pago NO se completó (Wompi no está conectado): el carrito debe conservarse
      const items = await p.evaluate(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14')).state.items.length);
      if (items !== 1) throw new Error('el carrito se vació sin pago confirmado');
    }, browser);

    await journey('6. Pedido pagado (webhook SINTÉTICO, no Wompi): confirmación y carrito vacío', async (p) => {
      await addToCart(p, 'camiseta-basica', 'M', 'Negro');
      await p.goto(`${BASE}/checkout`); await fillCheckout(p);
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/);
      const st = await state(); const num = st.orders[0].order_number;
      await fetch(`${API_URL}/__synthetic-mark-paid/${num}`);
      await p.reload();
      await expectText(p, num);
      const s2 = await state();
      if (s2.orders[0].status !== 'paid') throw new Error('estado no pagado');
      if (s2.inventories.find((i) => i.sku === 'CAM-M-NEG').stock !== 4) throw new Error('stock no descontado al pagar');
    }, browser);

    await journey('7. Checkout: sin stock al confirmar → error claro y carrito intacto', async (p) => {
      await addToCart(p, 'camiseta-basica', 'L', 'Negro'); // 1 unidad
      await p.goto(`${BASE}/checkout`); await fillCheckout(p);
      await fetch(`${API_URL}/rest/v1/rpc/create_order`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p_customer: { name: 'Otro', email: 'o@c.co', phone: '3000000000' }, p_shipping: { department: 'A', city: 'B', address: 'C 123' }, p_items: [{ variant_id: 'va-l-neg', quantity: 1 }], p_shipping_method: 'standard', p_idempotency_key: 'otro-cliente' }) });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await expectText(p, 'stock', 10000);
      if ((await state()).orders.length !== 1) throw new Error('se creó un pedido sin stock');
      const items = await p.evaluate(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14')).state.items.length);
      if (items !== 1) throw new Error('se perdió el carrito');
    }, browser);

    await journey('8. Registro, cierre e inicio de sesión, historial de pedidos', async (p) => {
      await p.goto(`${BASE}/login`);
      await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Ana Gómez');
      await p.locator('input[type=email]').fill('ana@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      const aviso = p.waitForEvent('dialog'); // la pantalla avisa con alert() tras crear la cuenta
      await p.locator('button[type=submit]').click(); await aviso; await p.waitForTimeout(300);
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      // compra con sesión
      await addToCart(p, 'polo-clasico', 'M');
      await p.goto(`${BASE}/checkout`); await fillCheckout(p, { email: 'ana@correo.co' });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/);
      const num = (await state()).orders[0].order_number;
      await p.goto(`${BASE}/cuenta/pedidos`); await expectText(p, num);
      // cerrar sesión, comprobar que la cuenta ya no muestra el pedido, volver a entrar
      await p.getByText(/cerrar sesi[oó]n/i).first().click();
      await p.waitForFunction(() => !Object.keys(localStorage).some((k) => k.includes('auth-token')));
      await p.goto(`${BASE}/cuenta`);
      await p.locator('input[type=email]').fill('ana@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.getByRole('button', { name: 'Iniciar sesión' }).first().click();
      await p.goto(`${BASE}/cuenta/pedidos`); await expectText(p, num);
    }, browser);

    await journey('9. Login: credenciales incorrectas y rutas protegidas', async (p) => {
      await login(p, '/login', 'nadie@correo.co', 'mala-clave', 'Iniciar Sesión');
      await expectText(p, 'Correo o contraseña incorrectos');
      await p.goto(`${BASE}/admin/dashboard`);
      await p.waitForURL(/\/admin\/login/); // anónimo → login de admin
      // un cliente registrado NO entra al panel
      await p.goto(`${BASE}/login`); await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Cliente'); await p.locator('input[type=email]').fill('c@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      const aviso = p.waitForEvent('dialog'); // la pantalla avisa con alert() tras crear la cuenta
      await p.locator('button[type=submit]').click(); await aviso; await p.waitForTimeout(300);
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      await p.goto(`${BASE}/admin/dashboard`);
      await p.waitForURL(/\/admin\/login/);
      await expectText(p, 'permisos administrativos');
    }, browser, /\[Login Exception\]/); // el login fallido registra ese error a propósito

    await journey('10. Admin: acceso, panel, inventario y gestión de pedidos', async (p) => {
      // crea un pedido como cliente anónimo y lo paga (sintético)
      await addToCart(p, 'polo-clasico', 'M'); await p.goto(`${BASE}/checkout`); await fillCheckout(p);
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click(); await p.waitForURL(/\/checkout\/confirmacion/);
      const num = (await state()).orders[0].order_number;
      await fetch(`${API_URL}/__synthetic-mark-paid/${num}`);
      await p.evaluate(() => localStorage.clear());
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      await expectText(p, num);
      // inventario: ajuste con motivo
      await p.goto(`${BASE}/admin/inventario`);
      await expectText(p, 'INVENTARIO (5 variantes)');
      const row = p.locator('tr', { hasText: 'POL-M-NEG' });
      await row.locator('input').first().fill('7');
      await row.locator('input').nth(1).fill('Llegó mercancía del proveedor');
      await row.getByRole('button').first().click();
      await p.waitForFunction(async () => true);
      const inv = (await state()).inventories.find((i) => i.sku === 'POL-M-NEG');
      if (inv.stock !== 16) throw new Error(`stock tras el ajuste ${inv.stock} ≠ 16 (10 − 1 vendida + 7)`);
      // pedidos: pagado → procesando → enviado (con guía)
      await p.goto(`${BASE}/admin/pedidos`); await expectText(p, num);
      const cambiar = async (estado, extra) => {
        await p.locator('tr', { hasText: num }).getByRole('button', { name: 'GESTIONAR' }).click();
        await p.locator('#order-next-status').selectOption(estado);
        if (extra) await extra();
        await p.getByRole('button', { name: 'GUARDAR CAMBIOS' }).click();
        await p.locator('#order-next-status').waitFor({ state: 'detached' });
      };
      await cambiar('processing');
      // enviar sin guía: la interfaz lo impide
      await p.locator('tr', { hasText: num }).getByRole('button', { name: 'GESTIONAR' }).click();
      await p.locator('#order-next-status').selectOption('shipped');
      await p.getByRole('button', { name: 'GUARDAR CAMBIOS' }).click();
      await expectText(p, 'transportadora y número de guía');
      await p.getByLabel('Transportadora').fill('Coordinadora'); await p.getByLabel('Número de guía').fill('GUIA-123');
      await p.getByRole('button', { name: 'GUARDAR CAMBIOS' }).click();
      await p.locator('#order-next-status').waitFor({ state: 'detached' });
      const o = (await state()).orders[0];
      if (o.status !== 'shipped' || o.carrier !== 'Coordinadora' || o.tracking_number !== 'GUIA-123') throw new Error(`estado final ${o.status}/${o.carrier}/${o.tracking_number}`);
      const ev = o.order_events.map((e) => e.to_status);
      if (!ev.includes('processing') || !ev.includes('shipped')) throw new Error(`historial incompleto: ${ev}`);
    }, browser);

    await browser.close();
  } finally { await stop(); }
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(WEB, 'e2e', 'last-synthetic-result.json'), JSON.stringify({ when: new Date().toISOString(), total: results.length, failed: failed.length, results }, null, 2));
  console.log(`\nE2E sintético: ${results.length - failed.length}/${results.length} recorridos OK`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
