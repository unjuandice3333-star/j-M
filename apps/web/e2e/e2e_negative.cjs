// RECORRIDO 5 — Casos negativos (navegador real contra el stack local)
const { chromium } = require('playwright');
const { st } = require('./lib_local.cjs');
const B = 'http://localhost:3000'; const PROD_E2E = process.env.PROD_E2E;
const say = (t) => console.log('▶ ' + t);
async function closeDrawer(p) {
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  if (await p.locator('.modal-overlay').count()) await p.locator('.modal-overlay').first().click({ position: { x: 8, y: 8 } }).catch(() => {});
  await p.waitForTimeout(200);
}
const svc = (path, opt = {}) => fetch(`${st.API_URL}${path}`, { ...opt, headers: { apikey: st.SERVICE_ROLE_KEY, Authorization: `Bearer ${st.SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opt.headers || {}) } }).then((r) => r.json());
async function addToCart(p, slug, qtyClicks = 0) {
  await p.goto(`${B}/producto/${slug}`, { waitUntil: 'networkidle' });
  await p.locator('#size-selector-container button[aria-label^="Talla"]:not([disabled])').first().click();
  for (let i = 0; i < qtyClicks; i++) await p.locator('button[aria-label="Aumentar cantidad"]').click();
  await p.getByRole('button', { name: 'AGREGAR AL CARRITO', exact: true }).first().click(); await p.waitForTimeout(400);
  await closeDrawer(p);
}
async function fillCheckout(p, email) {
  await p.goto(B + '/checkout', { waitUntil: 'networkidle' });
  await p.fill('input[name=firstName]', 'Neg'); await p.fill('input[name=lastName]', 'Caso'); await p.fill('input[name=email]', email);
  await p.fill('input[name=phone]', '3000000000'); await p.selectOption('select[name=department]', 'Valle del Cauca');
  await p.fill('input[name=city]', 'Cali'); await p.fill('input[name=address]', 'Avenida 6N # 20-30'); await p.waitForTimeout(700);
}
(async () => {
  const browser = await chromium.launch();
  say('stock: polo de última unidad');
  const a = await (await browser.newContext()).newPage();
  await a.goto(`${B}/producto/polo-pique-ultima-unidad`, { waitUntil: 'networkidle' });
  await a.locator('#size-selector-container button[aria-label^="Talla"]:not([disabled])').first().click();
  console.log('  + deshabilitado al llegar al disponible:', await a.locator('button[aria-label="Aumentar cantidad"]').isDisabled());
  await a.getByRole('button', { name: 'AGREGAR AL CARRITO', exact: true }).first().click(); await a.waitForTimeout(300); await closeDrawer(a);
  await a.getByRole('button', { name: 'AGREGAR AL CARRITO', exact: true }).first().click(); await a.waitForTimeout(300); await closeDrawer(a);
  console.log('  agregar 2.ª unidad →', (await a.locator('[role=alert]').first().innerText().catch(() => '¿?')).trim());
  say('concurrencia: dos compradores, una unidad');
  const b = await (await browser.newContext()).newPage();
  await addToCart(b, 'polo-pique-ultima-unidad');
  await fillCheckout(a, 'comprador.a@qa.jm.test'); await fillCheckout(b, 'comprador.b@qa.jm.test');
  await a.getByRole('button', { name: /CONFIRMAR Y PAGAR/ }).click(); await a.waitForURL(/confirmacion/, { timeout: 20000 }).catch(() => {});
  console.log('  A:', a.url().includes('confirmacion') ? 'pedido creado ✔' : 'sin pedido');
  await b.getByRole('button', { name: /CONFIRMAR Y PAGAR/ }).click(); await b.waitForTimeout(2500);
  console.log('  B →', (await b.locator('[role=alert]').first().innerText().catch(() => b.url())).replace(/\s+/g, ' ').slice(0, 110));
  say('cupones: vencido, inválido, mínimo de compra');
  const c = await (await browser.newContext()).newPage();
  await addToCart(c, 'camiseta-heavyweight-oversize');
  await c.goto(B + '/carrito', { waitUntil: 'networkidle' });
  for (const code of ['QAEXPIRADO', 'NOEXISTE', 'QAENVIO', 'QAFUTURO', 'QAAGOTADO', 'QAFIJO20K']) {
    await c.getByLabel('Código del cupón').fill(code); await c.getByRole('button', { name: 'APLICAR' }).click(); await c.waitForTimeout(900);
    console.log(`  ${code} →`, (await c.locator('text=/cupón|mínimo|vencido|vigente|límite|usaste/i').last().innerText().catch(() => '¿?')).trim().slice(0, 70));
  }
  say('cantidad cero: el botón − en 1 elimina la línea');
  await c.getByRole('button', { name: /Disminuir cantidad de/ }).first().click(); await c.waitForTimeout(500);
  console.log('  carrito tras −:', (await c.locator('h1, h2').filter({ hasText: /CARRITO/i }).first().innerText()).replace(/\s+/g, ' '));
  if (PROD_E2E) {
    say('producto que se despublica con unidades en un carrito');
    const d = await (await browser.newContext()).newPage();
    await addToCart(d, PROD_E2E);
    const [prod] = await svc(`/rest/v1/products?select=id&slug=eq.${PROD_E2E}`);
    await svc(`/rest/v1/rpc/admin_set_product_status`, { method: 'POST', body: JSON.stringify({ p_product_id: prod.id, p_status: 'draft' }) }).catch(() => null);
    await svc(`/rest/v1/products?id=eq.${prod.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'draft' }) });
    await d.goto(B + '/carrito', { waitUntil: 'networkidle' }); await d.waitForTimeout(1500);
    console.log('  aviso:', (await d.locator('[role=alert]').first().innerText().catch(() => 'sin aviso')).replace(/\s+/g, ' ').slice(0, 120));
    await svc(`/rest/v1/products?id=eq.${prod.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'active' }) });
  }
  say('pedido duplicado: doble clic en Confirmar');
  const e = await (await browser.newContext()).newPage();
  await addToCart(e, 'tenis-minimal-cuero');
  await fillCheckout(e, 'doble.clic@qa.jm.test');
  await e.getByRole('button', { name: /CONFIRMAR Y PAGAR/ }).dblclick();
  await e.waitForURL(/confirmacion/, { timeout: 20000 }).catch(() => {});
  const n = await svc(`/rest/v1/online_orders?select=order_number&customer_email=eq.doble.clic@qa.jm.test`);
  console.log('  pedidos creados para doble.clic:', n.length);
  say('error de red al cargar el catálogo');
  const f = await (await browser.newContext()).newPage();
  await f.route('**/rest/v1/products**', (r) => r.abort('internetdisconnected'));
  await f.goto(B + '/ropa', { waitUntil: 'networkidle' }); await f.waitForTimeout(1000);
  console.log('  catálogo sin red →', (await f.locator('text=/No pudimos cargar el catálogo/').first().innerText().catch(() => 'SIN MENSAJE VISIBLE')).slice(0, 80), '| productos simulados:', await f.locator('a[href^="/producto/"]').count());
  await browser.close();
})();
