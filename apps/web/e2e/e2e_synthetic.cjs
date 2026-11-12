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
const API = 54321; const APP = Number(process.env.E2E_PORT || 3110);
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
  try { await fn(page, ctx); } catch (e) { ok = false; if (process.env.E2E_DEBUG) console.log(e.message); detail = String(e.message).split('\n')[0]; await page.screenshot({ path: path.join(WEB, 'e2e', `fail-${name.replace(/\W+/g, '_')}.png`) }).catch(() => {}); }
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

    await journey('15. Catálogo: búsqueda sin tildes, ocasión real y filtros en móvil', async (p) => {
      // búsqueda desde la cabecera, sin tilde: «clasico» encuentra «Polo Clásico»
      await p.goto(`${BASE}/ropa?q=clasico`);
      await expectText(p, 'MOSTRANDO 1 PRENDAS');
      await p.getByText('Polo Clásico').first().waitFor();
      if (await p.getByText('Camiseta Básica').count()) throw new Error('la búsqueda devolvió la camiseta');
      // ocasión con el nombre de la BD (no de mockData)
      await p.goto(`${BASE}/ropa`);
      await expectText(p, 'MOSTRANDO 2 PRENDAS');
      if (await p.getByText('TRABAJO & OFICINA').count()) throw new Error('aún se muestran ocasiones de mockData');
      await p.locator('aside').getByRole('button', { name: 'Oficina', exact: true }).click();
      await expectText(p, 'MOSTRANDO 1 PRENDAS');
      // precio: sin límite por defecto; el tope del control es el precio real más alto
      const max = await p.locator('aside input[aria-label="Precio máximo"]').getAttribute('max');
      if (max !== '120000') throw new Error(`tope de precio ${max}`);
      // móvil: el panel incluye talla y precio, y filtra
      await p.setViewportSize({ width: 390, height: 844 });
      await p.goto(`${BASE}/ropa`);
      await expectText(p, 'MOSTRANDO 2 PRENDAS');
      await p.getByRole('button', { name: /FILTRAR/ }).click();
      const drawer = p.locator('.modal-overlay');
      await drawer.getByText('PRECIO MÁXIMO').waitFor();
      await drawer.getByRole('button', { name: 'S', exact: true }).click();
      await drawer.getByRole('button', { name: /VER RESULTADOS \(1\)/ }).click();
      await expectText(p, 'MOSTRANDO 1 PRENDAS');
      await p.getByText('Camiseta Básica').first().waitFor();
    }, browser);

    await journey('16. Portada: líneas, categorías y ocasiones desde la BD', async (p) => {
      await p.goto(`${BASE}/`);
      // BD sintética: 1 categoría (Camisetas), 1 línea (Urbana) y 1 ocasión (Oficina) con productos
      await p.locator('.featured-categories-grid a[href="/ropa/camisetas"]').waitFor({ timeout: 8000 });
      await p.locator('.occasions-grid a[href="/colecciones?ocasion=oficina"]').waitFor();
      const hrefs = await p.$$eval('.featured-categories-grid a, .occasions-grid a', (as) => as.map((a) => a.getAttribute('href')));
      for (const stale of ['/ropa/jeans', '/ropa/accesorios', '/colecciones?ocasion=trabajo']) if (hrefs.includes(stale)) throw new Error(`enlace de mockData: ${stale}`);
      if (await p.getByRole('button', { name: 'Explorar línea Elegante' }).count()) throw new Error('línea sin productos visible');
      await p.getByRole('button', { name: 'Explorar línea Urbana' }).click();
      await p.waitForURL(/\/linea\/urbana/);
      await expectText(p, 'MOSTRANDO 2 PRENDAS');
      await p.goto(`${BASE}/`);
      await p.locator('a[href="/colecciones?ocasion=oficina"]').first().click();
      await expectText(p, 'MOSTRANDO 1 PRENDAS');
      await p.getByText('Polo Clásico').first().waitFor();
    }, browser);

    await journey('21. Portada: boletín «Únete al club J&M» guarda el correo en la BD', async (p) => {
      await p.goto(`${BASE}/`);
      const form = p.locator('section[aria-labelledby="jm-newsletter-title"]');
      await form.scrollIntoViewIfNeeded();
      if (/10\s*%/.test(await form.textContent())) throw new Error('el boletín sigue prometiendo un 10% inexistente');
      const input = form.getByLabel('Correo electrónico para el boletín');
      await input.fill('club@');
      await form.getByRole('button', { name: 'Suscribirme' }).click();
      await form.getByRole('alert').filter({ hasText: 'nombre@dominio' }).waitFor();
      if ((await state()).newsletter.length) throw new Error('se guardó un correo inválido');
      await input.fill('  Club.Cliente@Example.co ');
      await form.getByRole('button', { name: 'Suscribirme' }).click();
      await form.getByRole('status').filter({ hasText: 'quedó registrado' }).waitFor();
      const subs = (await state()).newsletter;
      if (subs.length !== 1 || subs[0].email_normalized !== 'club.cliente@example.co' || subs[0].source !== 'home') throw new Error(`suscriptores: ${JSON.stringify(subs)}`);
      // repetir con otra capitalización no duplica
      await p.reload(); await form.scrollIntoViewIfNeeded();
      await input.fill('CLUB.cliente@example.co');
      await form.getByRole('button', { name: 'Suscribirme' }).click();
      await form.getByRole('status').waitFor();
      if ((await state()).newsletter.length !== 1) throw new Error('suscripción duplicada');
    }, browser);

    await journey('22. Catálogo: agregado rápido con el color elegido en la tarjeta', async (p) => {
      await p.setViewportSize({ width: 1440, height: 900 });
      await p.goto(`${BASE}/ropa`);
      // única tarjeta de la camiseta en /ropa: las etiquetas de sus botones son únicas en la página
      await p.getByRole('group', { name: 'Colores de Camiseta Básica' }).waitFor({ timeout: 8000 });
      await p.getByRole('heading', { name: 'Camiseta Básica' }).hover();
      // Negro por defecto: S no existe en Negro; tras elegir Blanco, M agotada y S disponible
      await p.getByRole('button', { name: 'Camiseta Básica en Blanco' }).click();
      const mAgotada = p.getByRole('button', { name: 'Talla M agotada en Blanco' });
      await mAgotada.waitFor();
      if (!(await mAgotada.isDisabled())) throw new Error('talla agotada en Blanco seleccionable');
      await p.getByRole('button', { name: 'Agregar talla S en Blanco al carrito' }).click();
      await p.waitForFunction(() => {
        const items = JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14') || '{"state":{"items":[]}}').state.items;
        return items.length === 1 && items[0].sku === 'CAM-S-BLA';
      });
    }, browser);

    await journey('17. Cabecera: menú de líneas y categorías desde la BD', async (p) => {
      await p.setViewportSize({ width: 1440, height: 900 });
      await p.goto(`${BASE}/`);
      const nav = p.locator('nav[aria-label="Navegación principal"]');
      await nav.locator('a[href="/linea/urbana"]').waitFor({ timeout: 8000 });
      // BD sintética: solo la línea Urbana y la categoría Camisetas (sin Calzado ni Accesorios)
      const desk = await nav.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      for (const stale of ['/linea/elegante', '/linea/casual', '/calzado', '/accesorios']) if (desk.includes(stale)) throw new Error(`enlace fijo en la cabecera: ${stale}`);
      await p.setViewportSize({ width: 390, height: 844 });
      await p.getByRole('button', { name: 'Abrir menú de navegación' }).click();
      const drawer = p.locator('.modal-overlay');
      await drawer.locator('a[href="/ropa/camisetas"]').waitFor();
      if (await drawer.locator('a[href="/ropa/polos"]').count()) throw new Error('subcategoría fija en el menú móvil');
      await drawer.locator('a[href="/ropa/camisetas"]').click();
      await p.waitForURL(/\/ropa\/camisetas/);
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

    await journey('18. Producto: «Encuentra tu talla» sugiere una talla real y la aplica con un color que la tiene', async (p) => {
      await p.goto(`${BASE}/producto/camiseta-basica`);
      await p.getByRole('button', { name: 'Color Blanco' }).click(); // Blanco/M agotado
      await p.getByRole('button', { name: /Encuentra tu talla/ }).click();
      await p.getByRole('button', { name: /CALCULAR MI TALLA/ }).click(); // 175 cm / 74 kg / normal → M
      await expectText(p, 'TALLA M');
      const body = await p.textContent('body');
      if (/94\s?%/.test(body)) throw new Error('el recomendador muestra una estadística inventada');
      await p.getByRole('button', { name: 'USAR TALLA M' }).click();
      await p.getByRole('button', { name: 'Talla M', exact: true, pressed: true }).waitFor();
      await p.getByRole('button', { name: 'Color Negro', pressed: true }).waitFor();
      await p.getByRole('button', { name: 'AGREGAR AL CARRITO' }).first().click();
      await p.waitForFunction(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14') || '{"state":{"items":[]}}').state.items.length === 1);
    }, browser);

    await journey('19. Completa el look: talla elegida por prenda, nada se agrega sin elegirla', async (p) => {
      await p.goto(`${BASE}/`); // la sección se monta en la portada
      const look = p.getByRole('region', { name: 'Outfit recomendado Completa el Look' });
      const buy = look.getByRole('button', { name: /COMPRAR EL LOOK COMPLETO/ });
      await buy.click();
      await look.getByText('Elige la talla de: Camiseta Básica').waitFor();
      const cart = () => p.evaluate(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14') || '{"state":{"items":[]}}').state.items.map((i) => `${i.sku}`));
      if ((await cart()).length) throw new Error('se agregó algo sin elegir talla');
      await look.getByLabel('Color de Camiseta Básica').selectOption('Blanco');
      const mBlanco = look.getByLabel('Talla de Camiseta Básica').locator('option[value="M"]');
      if (!(await mBlanco.isDisabled())) throw new Error('M/Blanco (agotada) se puede elegir');
      await look.getByLabel('Talla de Camiseta Básica').selectOption('S');
      await buy.click();
      await look.getByText('2 prenda(s) agregada(s) al carrito.').waitFor();
      const skus = (await cart()).sort().join(',');
      if (skus !== 'CAM-S-BLA,POL-M-NEG') throw new Error(`carrito: ${skus}`);
    }, browser);

    await journey('20. Favoritos: «Agregar todo al carrito» con talla elegida por prenda', async (p) => {
      await p.goto(`${BASE}/ropa`);
      await p.getByRole('button', { name: 'Guardar en favoritos: Camiseta Básica' }).first().click();
      await p.getByRole('button', { name: 'Guardar en favoritos: Polo Clásico' }).first().click();
      await p.goto(`${BASE}/cuenta/favoritos`);
      const cart = () => p.evaluate(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14') || '{"state":{"items":[]}}').state.items.map((i) => `${i.sku}`));
      const moveAll = p.getByRole('button', { name: /AGREGAR TODO AL CARRITO/ });
      await moveAll.click();
      await p.getByText('Elige la talla de: Camiseta Básica').waitFor();
      if ((await cart()).length) throw new Error('se agregó algo sin elegir talla');
      await p.getByLabel('Color de Camiseta Básica').selectOption('Negro');
      await p.getByLabel('Talla de Camiseta Básica').selectOption('L');
      await moveAll.click();
      await p.getByText('2 prenda(s) agregada(s) al carrito.').waitFor();
      const skus = (await cart()).sort().join(',');
      if (skus !== 'CAM-L-NEG,POL-M-NEG') throw new Error(`carrito: ${skus}`);
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
      // Textos de envío leídos de shipping_methods (standard: 12.000, gratis desde 200.000), no cifras fijas.
      await p.goto(`${BASE}/envios`);
      await expectText(p, 'ENVÍOS GRATIS EN COLOMBIA POR COMPRAS DESDE $200.000 COP');
      await expectText(p, '$12.000 COP para compras inferiores al monto mínimo');
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
      // El método de envío del pedido se muestra con su nombre configurado (shipping_methods.name)
      const metodo = await p.getByTestId('order-shipping-method').filter({ hasText: /Estándar/ }).textContent({ timeout: 10000 }).catch(() => p.getByTestId('order-shipping-method').textContent());
      if (!/Estándar/.test(metodo)) throw new Error(`método de envío en la confirmación: «${metodo}»`);
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

    await journey('11. Cuenta: perfil, direcciones y checkout con dirección guardada', async (p) => {
      await p.goto(`${BASE}/login`);
      await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Luisa Mora');
      await p.locator('input[type=email]').fill('luisa@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      await p.goto(`${BASE}/cuenta`);
      // perfil: validación visible y guardado real
      const perfil = p.getByTestId('profile-section');
      await perfil.locator('input[name=full_name]').fill('Luisa Fernanda Mora');
      await perfil.locator('input[name=phone]').fill('12');
      await perfil.getByRole('button', { name: 'Guardar datos' }).click();
      await perfil.getByText(/7 a 15 dígitos/).first().waitFor({ timeout: 5000 });
      await perfil.locator('input[name=phone]').fill('3109876543');
      await perfil.getByRole('button', { name: 'Guardar datos' }).click();
      await perfil.getByText('Datos guardados').waitFor({ timeout: 5000 });
      await p.locator('h1').filter({ hasText: 'Luisa Fernanda Mora' }).waitFor({ timeout: 5000 });
      // direcciones: dos direcciones, la segunda pasa a principal
      const libreta = p.getByTestId('address-book');
      const nueva = async (dept, city, line) => {
        await libreta.getByRole('button', { name: 'Agregar dirección' }).click();
        const f = libreta.getByTestId('address-form');
        await f.locator('select[name=department]').selectOption({ label: dept });
        await f.locator('input[name=city]').fill(city); await f.locator('input[name=address_line]').fill(line);
        await f.getByRole('button', { name: 'Guardar dirección' }).click();
        await libreta.getByText(line).first().waitFor({ timeout: 5000 });
      };
      await nueva('Antioquia', 'Envigado', 'Calle 40 Sur # 25-10');
      await nueva('Caldas', 'Manizales', 'Carrera 23 # 65-11');
      await libreta.getByTestId('address-item').filter({ hasText: 'Manizales' }).getByRole('button', { name: 'Hacer principal' }).click();
      await libreta.getByTestId('address-item').filter({ hasText: 'Manizales' }).getByText('Principal', { exact: true }).waitFor({ timeout: 5000 });
      // tras recargar, persiste (BD, no estado local)
      await p.reload();
      await p.getByTestId('address-item').first().filter({ hasText: 'Manizales' }).getByText('Principal', { exact: true }).waitFor({ timeout: 8000 });
      if ((await p.getByTestId('address-item').count()) !== 2) throw new Error('se esperaban 2 direcciones tras recargar');
      // checkout: sale la principal y se puede cambiar a la otra
      await addToCart(p, 'polo-clasico', 'M');
      await p.goto(`${BASE}/checkout`);
      await p.waitForFunction(() => document.querySelector('input[name=address]')?.value === 'Carrera 23 # 65-11', null, { timeout: 8000 });
      if ((await p.locator('input[name=phone]').inputValue()) !== '3109876543') throw new Error('el teléfono del perfil no llegó al checkout');
      const opt = await p.getByTestId('saved-address-select').locator('option', { hasText: 'Envigado' }).getAttribute('value');
      await p.getByTestId('saved-address-select').selectOption(opt);
      if ((await p.locator('input[name=city]').inputValue()) !== 'Envigado') throw new Error('elegir otra dirección guardada no cambió el formulario');
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/);
      const o = (await state()).orders[0];
      if (o.shipping_city !== 'Envigado' || o.shipping_address !== 'Calle 40 Sur # 25-10') throw new Error(`pedido con dirección inesperada: ${o.shipping_city} / ${o.shipping_address}`);
    }, browser);

    await journey('12. Cuenta: guardar la dirección del checkout y cambiar la contraseña', async (p) => {
      await p.goto(`${BASE}/login`);
      await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Marta Ruiz');
      await p.locator('input[type=email]').fill('marta@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      // checkout con dirección escrita a mano y «Guardar esta dirección en mi cuenta»
      await addToCart(p, 'polo-clasico', 'M');
      await p.goto(`${BASE}/checkout`); await fillCheckout(p, { email: 'marta@correo.co', city: 'Rionegro', address: 'Calle 49 # 50-12' });
      const guardar = p.getByTestId('save-address-checkbox');
      await guardar.check();
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/);
      await p.goto(`${BASE}/cuenta`);
      const item = p.getByTestId('address-item').filter({ hasText: 'Calle 49 # 50-12' });
      await item.getByText('Principal', { exact: true }).waitFor({ timeout: 8000 });
      if ((await p.getByTestId('address-item').count()) !== 1) throw new Error('se esperaba 1 dirección guardada desde el checkout');
      // cambiar la contraseña: la misma se rechaza con un motivo claro; una nueva sirve para volver a entrar
      const sec = p.getByTestId('account-password');
      await sec.locator('input[name=password]').fill('Clave-Segura-1'); await sec.locator('input[name=confirm]').fill('Clave-Segura-1');
      await sec.getByRole('button', { name: 'Cambiar contraseña' }).click();
      await sec.getByText(/distinta de la actual/).waitFor({ timeout: 5000 });
      await sec.locator('input[name=password]').fill('Clave-Nueva-22'); await sec.locator('input[name=confirm]').fill('Clave-Nueva-22');
      await sec.getByRole('button', { name: 'Cambiar contraseña' }).click();
      await sec.getByText(/Contraseña actualizada/).waitFor({ timeout: 5000 });
      await p.getByText(/cerrar sesi[oó]n/i).first().click();
      await p.waitForFunction(() => !Object.keys(localStorage).some((k) => k.includes('auth-token')));
      await p.goto(`${BASE}/cuenta`);
      await p.locator('input[type=email]').fill('marta@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.getByRole('button', { name: 'Iniciar sesión' }).first().click();
      await expectText(p, 'Correo o contraseña incorrectos');
      await p.locator('input[type=password]').fill('Clave-Nueva-22');
      await p.getByRole('button', { name: 'Iniciar sesión' }).first().click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
    }, browser);

    await journey('13. Enlace del pedido en otro navegador: pagar (rechazo de la BD → estado real) y cancelar', async (p) => {
      // Navegador A crea dos pedidos; el navegador B (contexto nuevo, sin localStorage) solo tiene el enlace.
      for (let i = 0; i < 2; i += 1) {
        await addToCart(p, 'camiseta-basica', 'M', 'Negro');
        await p.goto(`${BASE}/checkout`); await fillCheckout(p);
        await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
        await p.waitForURL(/\/checkout\/confirmacion/);
        await expectText(p, 'Pedido registrado');
      }
      const st = await state();
      const [second, first] = st.orders; // unshift: el más reciente primero
      const link = (o) => `${BASE}/checkout/confirmacion?order=${encodeURIComponent(o.order_number)}&token=${encodeURIComponent(o.public_token)}`;
      const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
      try {
        const b = await ctxB.newPage();
        // /api/wompi/signature interceptado: se comprueba que el navegador B envía id + token del enlace; la BD
        // sintética marca el pedido como pagado (webhook SINTÉTICO) y la API responde «ya no admite pagos».
        let sent = null;
        await b.route('**/api/wompi/signature', async (route) => {
          sent = JSON.parse(route.request().postData() || '{}');
          await fetch(`${API_URL}/__synthetic-mark-paid/${first.order_number}`);
          await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Este pedido ya no admite pagos.', code: 'JM_ORDER_NOT_PAYABLE' }) });
        });
        await b.goto(link(first));
        await expectText(b, 'Pedido registrado');
        if (await b.getByText('Este pedido se creó en otro navegador').count()) throw new Error('el enlace no permite actuar sobre el pedido');
        await b.getByRole('button', { name: 'Pagar ahora' }).click();
        await b.getByRole('alert').filter({ hasText: 'Este pedido ya no admite pagos.' }).waitFor({ timeout: 8000 });
        await expectText(b, '¡Gracias por tu compra!');
        if (!sent || sent.order_id !== first.id || sent.public_token !== first.public_token) throw new Error(`firma pedida con ${JSON.stringify(sent)}`);
        if (await b.getByRole('button', { name: 'Pagar ahora' }).count()) throw new Error('sigue ofreciendo pagar un pedido pagado');
        // Cancelar el segundo pedido desde B libera la reserva.
        b.on('dialog', (d) => d.accept().catch(() => {}));
        await b.goto(link(second));
        await b.getByRole('button', { name: 'Cancelar pedido' }).click();
        await expectText(b, 'Este pedido fue cancelado.');
        const s2 = await state();
        if (s2.orders.find((o) => o.id === second.id).status !== 'cancelled') throw new Error('el pedido no quedó cancelado');
        if (s2.inventories.find((i) => i.sku === 'CAM-M-NEG').reserved !== 0) throw new Error('la reserva no se liberó');
        // B recuerda los pedidos sobre los que actuó.
        const remembered = await b.evaluate(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14') || '{}').state?.orders?.map((o) => o.id) ?? []);
        if (!remembered.includes(first.id)) throw new Error('el pedido pagado desde el enlace no quedó en este navegador');
      } finally { await ctxB.close(); }
    }, browser);

    await journey('8. Registro, cierre e inicio de sesión, historial de pedidos', async (p) => {
      await p.goto(`${BASE}/login`);
      await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Ana Gómez');
      await p.locator('input[type=email]').fill('ana@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      const aviso = p.getByRole('status').filter({ hasText: 'Cuenta creada' }).waitFor(); // aviso en pantalla tras crear la cuenta
      await p.locator('button[type=submit]').click(); await aviso; await p.waitForTimeout(300);
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      // compra con sesión
      await addToCart(p, 'polo-clasico', 'M');
      await p.goto(`${BASE}/checkout`); await fillCheckout(p, { email: 'ana@correo.co' });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/);
      const num = (await state()).orders[0].order_number;
      await p.goto(`${BASE}/cuenta/pedidos`); await expectText(p, num);
      // El nombre llega al cargar shipping_methods; antes se ve el nombre de respaldo («Envío estándar»): esperar al final.
      const metodo = await p.getByTestId('order-shipping-method').filter({ hasText: /Estándar/ }).first().textContent({ timeout: 10000 }).catch(() => p.getByTestId('order-shipping-method').first().textContent());
      if (!/Estándar/.test(metodo)) throw new Error(`método de envío en «Mis pedidos»: «${metodo}»`);
      // cerrar sesión, comprobar que la cuenta ya no muestra el pedido, volver a entrar
      await p.getByText(/cerrar sesi[oó]n/i).first().click();
      await p.waitForFunction(() => !Object.keys(localStorage).some((k) => k.includes('auth-token')));
      await p.goto(`${BASE}/cuenta`);
      await p.locator('input[type=email]').fill('ana@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.getByRole('button', { name: 'Iniciar sesión' }).first().click();
      // esperar a que el login termine (sesión guardada) antes de navegar: si no, la navegación interrumpe la petición
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      await p.goto(`${BASE}/cuenta/pedidos`); await expectText(p, num);
    }, browser);

    await journey('14. Mis pedidos: pagar (rechazo de la BD → estado real), cancelar y ventana vencida desde la lista', async (p) => {
      await p.goto(`${BASE}/login`);
      await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Luis Mora');
      await p.locator('input[type=email]').fill('luis@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      for (let i = 0; i < 3; i += 1) {
        await addToCart(p, 'camiseta-basica', 'M', 'Negro');
        await p.goto(`${BASE}/checkout`); await fillCheckout(p, { email: 'luis@correo.co' });
        await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
        await p.waitForURL(/\/checkout\/confirmacion/);
        await expectText(p, 'Pedido registrado');
      }
      const [toExpire, toCancel, toPay] = (await state()).orders; // unshift: el más reciente primero
      await fetch(`${API_URL}/__synthetic-expire-window/${toExpire.order_number}`);
      let sent = null;
      await p.route('**/api/wompi/signature', async (route) => {
        sent = JSON.parse(route.request().postData() || '{}');
        await fetch(`${API_URL}/__synthetic-mark-paid/${toPay.order_number}`);
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Este pedido ya no admite pagos.', code: 'JM_ORDER_NOT_PAYABLE' }) });
      });
      p.on('dialog', (d) => d.accept().catch(() => {}));
      await p.goto(`${BASE}/cuenta/pedidos`);
      const card = (o) => p.locator('div').filter({ has: p.getByText(`PEDIDO #${o.order_number}`, { exact: true }) }).filter({ has: p.getByTestId('order-shipping-method') }).last();
      // Ventana vencida: sin «Pagar ahora», marcado como vencido.
      await card(toExpire).getByTestId('order-window-closed').waitFor({ timeout: 10000 });
      if (await card(toExpire).getByTestId('order-pay').count()) throw new Error('ofrece pagar con la ventana vencida');
      await card(toExpire).getByText('Pago vencido').waitFor();
      // Pagar desde la lista: la firma se pide con id + token; la BD ya lo tenía pagado → estado real.
      await card(toPay).getByTestId('order-pay-deadline').waitFor();
      await card(toPay).getByTestId('order-pay').click();
      await card(toPay).getByTestId('order-action-error').filter({ hasText: 'ya no admite pagos' }).waitFor({ timeout: 8000 });
      await card(toPay).getByText('Compra completada').waitFor({ timeout: 8000 });
      if (!sent || sent.order_id !== toPay.id || sent.public_token !== toPay.public_token) throw new Error(`firma pedida con ${JSON.stringify(sent)}`);
      if (await card(toPay).getByTestId('order-pay').count()) throw new Error('sigue ofreciendo pagar un pedido pagado');
      // Cancelar desde la lista libera la reserva.
      await card(toCancel).getByTestId('order-cancel').click();
      await card(toCancel).getByText('Cancelado', { exact: true }).waitFor({ timeout: 8000 });
      const s2 = await state();
      if (s2.orders.find((o) => o.id === toCancel.id).status !== 'cancelled') throw new Error('el pedido no quedó cancelado');
      if (await card(toCancel).getByTestId('order-cancel').count()) throw new Error('sigue ofreciendo cancelar un pedido cancelado');
    }, browser);

    await journey('9. Login: credenciales incorrectas y rutas protegidas', async (p) => {
      await login(p, '/login', 'nadie@correo.co', 'mala-clave', 'Iniciar Sesión');
      await expectText(p, 'Correo o contraseña incorrectos');
      await p.goto(`${BASE}/admin/dashboard`);
      await p.waitForURL(/\/admin\/login/); // anónimo → login de admin
      // un cliente registrado NO entra al panel
      await p.goto(`${BASE}/login`); await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Cliente'); await p.locator('input[type=email]').fill('c@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      const aviso = p.getByRole('status').filter({ hasText: 'Cuenta creada' }).waitFor(); // aviso en pantalla tras crear la cuenta
      await p.locator('button[type=submit]').click(); await aviso; await p.waitForTimeout(300);
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      await p.goto(`${BASE}/admin/dashboard`);
      await p.waitForURL(/\/admin\/login/);
      await expectText(p, 'permisos administrativos');
    }, browser, /\[Login Exception\]/); // el login fallido registra ese error a propósito

    await journey('23. Admin: boletín, búsqueda, baja, reactivación y CSV', async (p) => {
      // suscripción real desde la portada con un correo propio de este recorrido
      await p.goto(`${BASE}/`);
      const form = p.locator('section[aria-labelledby="jm-newsletter-title"]');
      await form.scrollIntoViewIfNeeded();
      await form.getByLabel('Correo electrónico para el boletín').fill('boletin.admin@example.co');
      await form.getByRole('button', { name: 'Suscribirme' }).click();
      await form.getByRole('status').filter({ hasText: 'quedó registrado' }).waitFor();
      await p.evaluate(() => localStorage.clear());
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      await p.getByRole('link', { name: 'Boletín' }).first().click();
      await p.waitForURL(/\/admin\/boletin/);
      await p.getByLabel('Buscar suscriptores').fill('BOLETIN.ADMIN');
      const row = p.locator('tbody tr', { hasText: 'boletin.admin@example.co' });
      await row.waitFor();
      if ((await p.locator('tbody tr').count()) !== 1) throw new Error('la búsqueda no filtró');
      await row.getByRole('button', { name: 'Dar de baja boletin.admin@example.co' }).click();
      await p.getByRole('status').filter({ hasText: 'dado de baja' }).waitFor();
      let s = (await state()).newsletter.find((x) => x.email_normalized === 'boletin.admin@example.co');
      if (!s.unsubscribed_at) throw new Error('la baja no se guardó');
      await p.getByLabel('Filtrar por estado').selectOption('bajas');
      await row.getByRole('button', { name: 'Reactivar boletin.admin@example.co' }).click();
      await p.getByRole('status').filter({ hasText: 'reactivado' }).waitFor();
      s = (await state()).newsletter.find((x) => x.email_normalized === 'boletin.admin@example.co');
      if (s.unsubscribed_at) throw new Error('la reactivación no se guardó');
      await p.getByLabel('Filtrar por estado').selectOption('todos');
      const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /Exportar CSV/ }).click()]);
      const csv = fs.readFileSync(await dl.path(), 'utf8');
      if (!/^\uFEFFcorreo,estado,origen/.test(csv) || !csv.includes('boletin.admin@example.co,activo,home')) throw new Error(`CSV: ${csv.slice(0, 200)}`);
      if (!/^suscriptores-boletin-todos-\d{4}-\d{2}-\d{2}\.csv$/.test(dl.suggestedFilename())) throw new Error(`nombre: ${dl.suggestedFilename()}`);
    }, browser);

    await journey('24. Cuenta: baja y alta del boletín desde «Mis datos»', async (p) => {
      // suscripción en la portada con el mismo correo (otra capitalización) que luego usa la cuenta
      await p.goto(`${BASE}/`);
      const form = p.locator('section[aria-labelledby="jm-newsletter-title"]');
      await form.scrollIntoViewIfNeeded();
      await form.getByLabel('Correo electrónico para el boletín').fill('Marta.Club@Correo.co');
      await form.getByRole('button', { name: 'Suscribirme' }).click();
      await form.getByRole('status').filter({ hasText: 'quedó registrado' }).waitFor();
      await p.goto(`${BASE}/login`);
      await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Marta Club');
      await p.locator('input[type=email]').fill('marta.club@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      await p.goto(`${BASE}/cuenta`);
      const perfil = p.getByTestId('profile-section');
      const box = perfil.locator('input[name=marketing_opt_in]');
      await perfil.getByText('Estás suscrito').waitFor({ timeout: 8000 });
      if (!(await box.isChecked())) throw new Error('la casilla no refleja la suscripción de la portada');
      await box.uncheck();
      await perfil.getByRole('button', { name: 'Guardar datos' }).click();
      await perfil.getByText('Te diste de baja del boletín').waitFor({ timeout: 5000 });
      const row = () => state().then((st) => st.newsletter.find((x) => x.email_normalized === 'marta.club@correo.co'));
      if (!(await row()).unsubscribed_at) throw new Error('la baja no se guardó en la lista');
      await p.reload();
      await perfil.getByText('Puedes darte de baja').waitFor({ timeout: 8000 });
      if (await box.isChecked()) throw new Error('tras recargar la casilla sigue marcada');
      await box.check();
      await perfil.getByRole('button', { name: 'Guardar datos' }).click();
      await perfil.getByText('Quedaste suscrito').waitFor({ timeout: 5000 });
      if ((await row()).unsubscribed_at) throw new Error('el alta no se guardó en la lista');
    }, browser);

    await journey('25. Producto: el comprador opina y la reseña queda pendiente de moderación', async (p) => {
      await p.goto(`${BASE}/producto/camiseta-basica`);
      const caja = p.getByTestId('review-form');
      await caja.getByText('Inicia sesión').waitFor({ timeout: 8000 }); // sin sesión: invitación, sin formulario
      await p.goto(`${BASE}/login`);
      await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Lucía Pérez');
      await p.locator('input[type=email]').fill('lucia.resena@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      // sin compra pagada: no hay formulario
      await p.goto(`${BASE}/producto/camiseta-basica`);
      await caja.getByText('Solo los clientes que compraron').waitFor({ timeout: 8000 });
      await addToCart(p, 'camiseta-basica', 'M');
      await p.goto(`${BASE}/checkout`); await fillCheckout(p, { email: 'lucia.resena@correo.co' });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click(); await p.waitForURL(/\/checkout\/confirmacion/);
      const num = (await state()).orders[0].order_number;
      await fetch(`${API_URL}/__synthetic-mark-paid/${num}`);
      await p.goto(`${BASE}/producto/camiseta-basica`);
      await caja.getByText(num).waitFor({ timeout: 8000 });
      await caja.getByRole('button', { name: 'Enviar opinión' }).click(); // vacío → errores en pantalla, nada guardado
      await caja.getByText('Elige una calificación').waitFor();
      if ((await state()).reviews.length) throw new Error('se guardó una reseña inválida');
      await caja.getByRole('button', { name: '5 de 5 estrellas' }).click();
      await caja.getByLabel('Título').fill('Excelente camiseta');
      await caja.getByLabel('Comentario').fill('La tela es suave y la talla M me quedó perfecta.');
      await caja.getByLabel('Ciudad (opcional)').fill('Cali');
      await caja.getByRole('button', { name: 'Enviar opinión' }).click();
      await caja.getByText('Recibimos tu opinión').waitFor({ timeout: 5000 });
      await caja.getByText('pendiente de aprobación').waitFor();
      const rv = (await state()).reviews;
      if (rv.length !== 1 || rv[0].status !== 'pending' || rv[0].author_name !== 'Lucía P.' || rv[0].rating !== 5) throw new Error(`reseña guardada: ${JSON.stringify(rv)}`);
      await p.reload();
      await caja.getByText('pendiente de aprobación').waitFor({ timeout: 8000 });
      if (await caja.getByRole('button', { name: 'Enviar opinión' }).count()) throw new Error('se permite opinar dos veces sobre la misma compra');
      if (await p.getByText('Excelente camiseta').count() !== 1) throw new Error('la reseña pendiente aparece publicada en la ficha');
    }, browser);

    await journey('26. Entregado: invitación a opinar, reseña, respuesta del admin y columnas privadas', async (p) => {
      // Lectura pública sin identificadores internos (GRANT por columnas): pedir user_id falla con 42501.
      const priv = await fetch(`${API_URL}/rest/v1/product_reviews?select=id,user_id`);
      if (priv.status !== 401 || (await priv.json()).code !== '42501') throw new Error(`user_id legible en product_reviews: ${priv.status}`);
      await p.goto(`${BASE}/login`);
      await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Marta Gómez');
      await p.locator('input[type=email]').fill('marta.entrega@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      await addToCart(p, 'polo-clasico', 'M');
      await p.goto(`${BASE}/checkout`); await fillCheckout(p, { email: 'marta.entrega@correo.co' });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click(); await p.waitForURL(/\/checkout\/confirmacion/);
      const num = (await state()).orders[0].order_number;
      await fetch(`${API_URL}/__synthetic-mark-paid/${num}`);
      // pagado sin entregar: sin invitación
      await p.goto(`${BASE}/cuenta/pedidos`); await expectText(p, num);
      if (await p.getByText('OPINA SOBRE TUS COMPRAS').count()) throw new Error('invitación a opinar antes de la entrega');
      await fetch(`${API_URL}/__synthetic-mark-delivered/${num}`);
      await p.reload();
      await p.getByText('OPINA SOBRE TUS COMPRAS').waitFor({ timeout: 8000 });
      await p.getByRole('link', { name: 'Opinar sobre Polo Clásico' }).click();
      await p.waitForURL(/\/producto\/polo-clasico#opiniones$/);
      const caja = p.getByTestId('review-form');
      await caja.getByText(num).waitFor({ timeout: 8000 });
      await caja.getByRole('button', { name: '4 de 5 estrellas' }).click();
      await caja.getByLabel('Título').fill('Buen polo');
      await caja.getByLabel('Comentario').fill('Buena tela, el cuello no se deforma al lavarlo.');
      await caja.getByRole('button', { name: 'Enviar opinión' }).click();
      await caja.getByText('Recibimos tu opinión').waitFor({ timeout: 5000 });
      // ya opinó: la invitación desaparece
      await p.goto(`${BASE}/cuenta/pedidos`); await expectText(p, num);
      await p.waitForTimeout(500);
      if (await p.getByText('OPINA SOBRE TUS COMPRAS').count()) throw new Error('la invitación sigue tras opinar');
      // admin aprueba con respuesta pública
      await p.evaluate(() => localStorage.clear());
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      // ejecución 73: el menú cuenta la reseña pendiente; filtro por producto y por texto
      await p.getByLabel('1 reseña pendiente').waitFor({ timeout: 8000 });
      await p.goto(`${BASE}/admin/reviews`);
      await p.getByRole('tab', { name: 'Pendiente (1)' }).waitFor({ timeout: 8000 });
      const prodSel = p.getByLabel('Filtrar por producto');
      await prodSel.selectOption({ label: 'Polo Clásico (1 · 1 pendiente)' });
      await p.getByLabel('Buscar reseñas').fill('CUELLO');
      const card = p.getByRole('article', { name: /Buen polo/ });
      await card.getByLabel('Respuesta de la tienda').fill('¡Gracias, Marta! Nos alegra que te guste.');
      await card.getByRole('button', { name: 'Aprobar' }).click();
      await p.getByText('Reseña de Marta G.: aprobada.').waitFor({ timeout: 8000 });
      await p.getByRole('tab', { name: 'Pendiente (0)' }).waitFor({ timeout: 8000 });
      await p.waitForFunction(() => !document.querySelector('[aria-label="1 reseña pendiente"]'), null, { timeout: 8000 });
      // el público ve la reseña y la respuesta de J&M
      await p.evaluate(() => localStorage.clear());
      await p.goto(`${BASE}/producto/polo-clasico`);
      await p.getByText('Buen polo').waitFor({ timeout: 8000 });
      await p.getByRole('note', { name: 'Respuesta de J&M' }).getByText('¡Gracias, Marta! Nos alegra que te guste.').waitFor();
    }, browser);

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
      // Ejecución 76: tarjeta «Por preparar» del dashboard → /admin/pedidos?estado=paid con la pestaña «Pagado» activa
      const paidCount = (await state()).orders.filter((x) => x.status === 'paid').length;
      const prepCard = p.getByRole('link', { name: /^Ver pedidos pagados por preparar/ });
      await prepCard.filter({ hasText: `${paidCount} pedido` }).waitFor({ timeout: 8000 });
      await prepCard.click();
      await p.waitForURL(/\/admin\/pedidos\?estado=paid$/, { timeout: 8000 });
      await p.getByRole('button', { name: `Pagado (${paidCount})`, pressed: true }).waitFor({ timeout: 8000 });
      await expectText(p, num);
      await p.reload();
      await p.getByRole('button', { name: `Pagado (${paidCount})`, pressed: true }).waitFor({ timeout: 8000 });
      // Ejecución 77: tarjeta «Alertas de stock» del dashboard → /admin/inventario?stock=alerta con las mismas variantes
      const lowNow = (await state()).inventories.filter((x) => x.stock - x.reserved <= 2).length; // min_stock = 2 en la BD sintética
      await p.goto(`${BASE}/admin/dashboard`);
      const stockCard = p.getByRole('link', { name: /^Ver variantes con stock bajo o agotado/ });
      await stockCard.filter({ hasText: `${lowNow} variante` }).waitFor({ timeout: 8000 });
      await stockCard.click();
      await p.waitForURL(/\/admin\/inventario\?stock=alerta$/, { timeout: 8000 });
      if (await p.getByLabel('Filtrar por estado de stock').inputValue() !== 'alerta') throw new Error('filtro de stock no aplicado');
      if (lowNow > 0) {
        await p.locator('tbody tr').nth(lowNow - 1).waitFor({ timeout: 8000 });
        const shown = await p.locator('tbody tr').count();
        if (shown !== lowNow) throw new Error(`variantes en alerta mostradas ${shown} ≠ ${lowNow}`);
      } else await expectText(p, 'Ninguna variante coincide con el filtro.');
      // Ejecución 78: la tarjeta KPI del inventario muestra el mismo número y, pulsada otra vez, quita el filtro
      const kpiAlert = p.getByRole('button', { name: new RegExp(`^Quitar filtro: ${lowNow} variante\\(s\\) stock bajo o agotado$`) });
      if ((await kpiAlert.getAttribute('aria-pressed')) !== 'true') throw new Error('tarjeta KPI de alertas no marcada');
      await kpiAlert.click();
      await p.waitForURL(/\/admin\/inventario$/, { timeout: 8000 });
      if (await p.getByLabel('Filtrar por estado de stock').inputValue() !== 'todos') throw new Error('la tarjeta KPI no quitó el filtro');
      // tarjeta «Requieren revisión» → /admin/pedidos?revision=1 con la casilla marcada
      await p.goto(`${BASE}/admin/dashboard`);
      await p.getByRole('link', { name: /^Ver pedidos que requieren revisión/ }).click();
      await p.waitForURL(/\/admin\/pedidos\?revision=1$/, { timeout: 8000 });
      if (!(await p.getByLabel(/^Solo los que requieren revisión/).isChecked())) throw new Error('casilla de revisión sin marcar');
      // inventario: ajuste con motivo
      await p.goto(`${BASE}/admin/inventario`);
      await expectText(p, 'INVENTARIO (5 variantes)');
      const row = p.locator('tr', { hasText: 'POL-M-NEG' });
      await row.locator('input').first().fill('7');
      await row.locator('input').nth(1).fill('Llegó mercancía del proveedor');
      await row.getByRole('button').first().click();
      // el ajuste es asíncrono: sondear la BD sintética (hasta 10 s) en vez de leer justo tras el clic
      let inv; for (let i = 0; i < 50; i++) { inv = (await state()).inventories.find((x) => x.sku === 'POL-M-NEG'); if (inv.stock === 16) break; await new Promise((r) => setTimeout(r, 200)); }
      if (inv.stock !== 16) throw new Error(`stock tras el ajuste ${inv.stock} ≠ 16 (10 − 1 vendida + 7)`);
      // pedidos: pagado → procesando → enviado (con guía)
      await p.goto(`${BASE}/admin/pedidos`); await expectText(p, num);
      // Paginación real: el total viene del conteo exacto de la BD (Content-Range), no de las filas cargadas.
      const info = await p.getByTestId('orders-page-info').textContent({ timeout: 10000 });
      if (!/^Mostrando \d+ de \d+ pedidos/.test(info)) throw new Error(`info de paginación: «${info}»`);
      const cambiar = async (estado, extra) => {
        await p.locator('tr', { hasText: num }).getByRole('button', { name: 'GESTIONAR' }).click();
        await p.locator('#order-next-status').selectOption(estado);
        if (extra) await extra();
        await p.getByRole('button', { name: 'GUARDAR CAMBIOS' }).click();
        await p.locator('#order-next-status').waitFor({ state: 'detached' });
      };
      // Ejecución 75: insignia «pedidos por preparar» del menú = pedidos pagados en la BD (HEAD count=exact)
      const paidNow = async () => (await state()).orders.filter((x) => x.status === 'paid').length;
      const badge = p.getByRole('link', { name: /^Pedidos/ }).locator('[aria-label$="por preparar"]');
      const paidBefore = await paidNow();
      if (paidBefore < 1) throw new Error('se esperaba al menos un pedido pagado');
      await badge.filter({ hasText: String(paidBefore) }).waitFor({ timeout: 8000 });
      await cambiar('processing');
      // al pasar a «En preparación» la insignia se recuenta sin recargar la página
      const paidAfter = await paidNow();
      if (paidAfter !== paidBefore - 1) throw new Error(`pagados tras preparar ${paidAfter} ≠ ${paidBefore - 1}`);
      if (paidAfter === 0) await badge.waitFor({ state: 'detached', timeout: 8000 });
      else await badge.filter({ hasText: String(paidAfter) }).waitFor({ timeout: 8000 });
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
