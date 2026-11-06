// M28 — Prueba comercial integral (navegador real contra el stack LOCAL, con aserciones).
// Admin: crea producto, ajusta inventario, cambia portada, gestiona pedidos.
// Clientes: nuevo (registro + compra con cupón + pago aprobado) y recurrente (compra sin cupón + pago rechazado,
// pendiente y aprobado tras reintento). Los eventos de pago se firman con el secreto de eventos LOCAL ficticio y entran
// por el MISMO endpoint /api/wompi/webhook que usaría Wompi (Wompi Sandbox real: ver wompi_sandbox.cjs).
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const { st, setPassword, ADMIN_ID, CLIENTE1_ID, tinyPng } = require('./lib_local.cjs');
const { signedEvent } = require('./lib_wompi.cjs');
const B = 'http://localhost:3000';
const SECRET = process.env.WOMPI_EVENTS_SECRET; if (!SECRET) { console.error('falta WOMPI_EVENTS_SECRET (el LOCAL con el que corre vite)'); process.exit(3); }
const stamp = Date.now().toString(36).toUpperCase();
const PNG = require('path').join(require('os').tmpdir(), `jm-com-${stamp}.png`); require('fs').writeFileSync(PNG, tinyPng());
let fails = 0; const ok = (c, m) => { console.log(`${c ? '  ✔' : '  ✘'} ${m}`); if (!c) fails++; return c; };
const sql = (q) => execFileSync('psql', [st.DB_URL, '-Atc', q], { encoding: 'utf8' }).trim();
const say = (t) => console.log('▶ ' + t);
const webhook = async (sig, status, txId = `com-${stamp}-${Math.random().toString(36).slice(2, 7)}`) => {
  const r = await fetch(B + '/api/wompi/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signedEvent({ reference: sig.reference, amountInCents: sig.amount_in_cents, status, txId, secret: SECRET })) });
  return { status: r.status, body: await r.json() };
};
const orderRow = (num) => { const [status, user, discount, total, coupon] = sql(`select status, coalesce(user_id::text,''), discount_total, total, coalesce(coupon_code,'') from online_orders where order_number='${num}'`).split('|'); return { status, user, discount: Number(discount), total: Number(total), coupon }; };
const available = (sku) => Number(sql(`select a.available from v_variant_availability a join variants v on v.id=a.variant_id where v.sku='${sku}'`));
async function checkout(p, data) {
  await p.goto(B + '/checkout', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  for (const [k, v] of Object.entries(data)) {
    if (k === 'department') await p.selectOption('select[name=department]', v);
    else if (!(await p.inputValue(`input[name=${k}]`))) await p.fill(`input[name=${k}]`, v);
  }
  const sigResp = p.waitForResponse((r) => r.url().endsWith('/api/wompi/signature'), { timeout: 20000 });
  await p.getByRole('button', { name: /CONFIRMAR Y PAGAR/ }).click();
  const sig = await (await sigResp).json();
  await p.waitForURL(/\/checkout\/confirmacion/, { timeout: 20000 });
  const u = new URL(p.url()); return { sig, number: u.searchParams.get('order'), token: u.searchParams.get('token') };
}
const statusText = async (p) => (await p.locator('[role=status]').first().innerText()).replace(/\s+/g, ' ');

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const mk = async (vp = { width: 1400, height: 900 }) => { const p = await (await browser.newContext({ viewport: vp })).newPage(); p.on('pageerror', (e) => errs.push(e.message)); return p; };
  const apwd = await setPassword(ADMIN_ID);
  const adm = await mk();
  await adm.goto(B + '/admin/login', { waitUntil: 'networkidle' });
  await adm.fill('input[type=email]', 'admin@qa.jm.test'); await adm.fill('input[type=password]', apwd);
  await adm.locator('form button[type=submit]').first().click(); await adm.waitForURL(/\/admin\/dashboard/, { timeout: 15000 });

  // ------------------------------------------------------------------ 1. admin crea un producto
  say('ADMIN crea un producto publicado con imagen, tallas y stock');
  const NAME = `Camiseta Comercial ${stamp}`;
  await adm.goto(B + '/admin/productos/nuevo', { waitUntil: 'networkidle' }); await adm.waitForTimeout(800);
  await adm.fill('#pf-name', NAME); await adm.selectOption('#pf-cat', 'camisetas');
  await adm.fill('#pf-price', '120000');
  await adm.getByRole('button', { name: 'Negro', exact: true }).click();
  await adm.setInputFiles('input[type=file]', PNG); await adm.waitForTimeout(2500);
  await adm.getByRole('button', { name: 'M', exact: true }).click(); await adm.getByRole('button', { name: 'L', exact: true }).click();
  await adm.fill('input[aria-label="Stock inicial Negro M"]', '2'); await adm.fill('input[aria-label="Stock inicial Negro L"]', '2');
  await adm.getByRole('button', { name: /Guardar y publicar/ }).click(); await adm.waitForTimeout(3000);
  const slug = await adm.inputValue('#pf-slug');
  ok(sql(`select status from products where slug='${slug}'`) === 'active', `producto ${slug} activo en la BD`);
  const SKU_L = sql(`select v.sku from variants v join products p on p.id=v.product_id join sizes s on s.id=v.size_id where p.slug='${slug}' and s.code='L'`);
  ok(available(SKU_L) === 2, 'stock inicial L = 2');
  ok(Number(sql(`select count(*) from product_images i join products p on p.id=i.product_id where p.slug='${slug}' and i.storage_path is not null`)) >= 1, 'imagen subida a Storage');

  // ------------------------------------------------------------------ 2. admin ajusta inventario
  say('ADMIN ajusta el inventario (+3 en L, con motivo)');
  await adm.goto(B + '/admin/inventario', { waitUntil: 'networkidle' }); await adm.waitForTimeout(1200);
  const row = adm.locator('tr', { has: adm.locator(`text=SKU: ${SKU_L}`) });
  await row.locator('input[type=number]').fill('3'); await row.locator('input[placeholder=Motivo]').fill(`Entrada comercial ${stamp}`);
  await row.getByRole('button', { name: 'Ajustar' }).click(); await adm.waitForTimeout(1500);
  ok(available(SKU_L) === 5, `stock L = 5 tras el ajuste (${available(SKU_L)})`);
  ok(sql(`select reason from inventory_movements m join variants v on v.id=m.variant_id where v.sku='${SKU_L}' order by m.created_at desc limit 1`) === `Entrada comercial ${stamp}`, 'movimiento registrado con motivo');

  // ------------------------------------------------------------------ 3. admin cambia la portada
  say('ADMIN cambia una imagen de portada (Camisetas) y la tienda la muestra');
  await adm.goto(B + '/admin/imagenes', { waitUntil: 'networkidle' });
  const card = adm.locator('[data-key=category_camisetas]');
  await card.getByRole('button', { name: /Cambiar imagen/ }).click();
  await adm.setInputFiles('input[aria-label="Subir imagen"]', PNG);
  await adm.waitForFunction(() => document.querySelector('[role=dialog] img')?.src.includes('/site-content/library/'), null, { timeout: 10000 });
  await adm.getByRole('button', { name: 'Guardar y publicar' }).click();
  await adm.getByRole('status').filter({ hasText: 'Imagen guardada' }).waitFor({ timeout: 10000 });
  const path = sql(`select storage_path from site_content where key='category_camisetas'`);
  const visitor = await mk({ width: 390, height: 844 });
  await visitor.goto(B + '/', { waitUntil: 'networkidle' });
  ok(await visitor.locator(`img[src*="${path}"]`).count() >= 1, 'un visitante (móvil) ve la nueva imagen de Camisetas en la portada');

  // ------------------------------------------------------------------ 4. cliente nuevo
  say('CLIENTE NUEVO: registro, compra con cupón QA10, pago aprobado');
  const email = `nuevo.${stamp.toLowerCase()}@qa.jm.test`;
  const c1 = await mk();
  await c1.goto(B + '/cuenta', { waitUntil: 'networkidle' });
  await c1.getByRole('button', { name: /Empieza/ }).click();
  await c1.fill('input[placeholder*="ombre" i], input[type=text]', 'Andrés Comercial');
  await c1.fill('input[type=email]', email); await c1.fill('input[type=password]', `Pw-${stamp}-ok`);
  await c1.getByRole('button', { name: /^Crear cuenta$/ }).click();
  await c1.getByText(/cerrar sesión/i).first().waitFor({ timeout: 15000 });
  const newUser = sql(`select id from auth.users where email='${email}'`);
  ok(Boolean(newUser), 'cuenta creada');
  await c1.goto(`${B}/producto/${slug}`, { waitUntil: 'networkidle' });
  await c1.locator('#size-selector-container button[aria-label="Talla L"]').click();
  await c1.locator('button[aria-label="Aumentar cantidad"]').click();
  await c1.getByRole('button', { name: 'AGREGAR AL CARRITO', exact: true }).first().click();
  await c1.goto(B + '/carrito', { waitUntil: 'networkidle' });
  await c1.getByLabel('Código del cupón').fill('QA10'); await c1.getByRole('button', { name: 'APLICAR' }).click(); await c1.waitForTimeout(1500);
  const o1 = await checkout(c1, { phone: '3005550101', department: 'Antioquia', city: 'Medellín', address: 'Carrera 43A # 1-50' });
  let r1 = orderRow(o1.number);
  ok(r1.status === 'payment_pending' && r1.user === newUser, `pedido ${o1.number} pendiente y asociado a la cuenta nueva`);
  ok(r1.coupon === 'QA10' && r1.discount === 24000, `cupón QA10 aplicado por la BD (descuento ${r1.discount})`);
  ok(available(SKU_L) === 3, 'stock L reservado (5 → 3)');
  const w1 = await webhook(o1.sig, 'APPROVED');
  ok(w1.status === 200 && w1.body.result === 'applied', `webhook APPROVED aplicado (${w1.body.result})`);
  await c1.waitForTimeout(6000);
  ok(orderRow(o1.number).status === 'paid' && /Pago confirmado/i.test(await statusText(c1)), 'confirmación muestra «Pago confirmado»');
  ok(await c1.evaluate(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14')).state.items.length) === 0, 'carrito vaciado tras el pago');

  // ------------------------------------------------------------------ 5. cliente recurrente
  say('CLIENTE RECURRENTE: compra sin cupón; pago rechazado → pendiente → aprobado tras reintento');
  const cpwd = await setPassword(CLIENTE1_ID);
  const prev = Number(sql(`select count(*) from online_orders where user_id='${CLIENTE1_ID}'`));
  const c2 = await mk({ width: 390, height: 844 });
  await c2.goto(B + '/cuenta', { waitUntil: 'networkidle' });
  await c2.fill('input[type=email]', 'cliente1@qa.jm.test'); await c2.fill('input[type=password]', cpwd);
  await c2.getByRole('button', { name: /^Iniciar sesión$/ }).click(); await c2.getByText(/cerrar sesión/i).first().waitFor({ timeout: 15000 });
  await c2.goto(B + '/cuenta/pedidos', { waitUntil: 'networkidle' }); await c2.waitForTimeout(1500);
  ok(prev >= 1 && await c2.getByText(/JM-0\d+/).count() >= prev, `ve su historial (${prev} pedidos previos)`);
  await c2.goto(`${B}/producto/${slug}`, { waitUntil: 'networkidle' });
  await c2.locator('#size-selector-container button[aria-label="Talla M"]').click();
  await c2.getByRole('button', { name: 'AGREGAR AL CARRITO', exact: true }).first().click();
  const o2 = await checkout(c2, { phone: '3000000001', department: 'Bogotá D.C.', city: 'Bogotá', address: 'Calle 80 # 10-20' });
  let r2 = orderRow(o2.number);
  ok(r2.user === CLIENTE1_ID && r2.discount === 0 && r2.coupon === '', `pedido ${o2.number} sin cupón, asociado al cliente recurrente`);
  const dec = await webhook(o2.sig, 'DECLINED');
  ok(dec.status === 200 && orderRow(o2.number).status === 'payment_pending', 'pago RECHAZADO → el pedido sigue pendiente');
  await c2.reload({ waitUntil: 'networkidle' }); await c2.waitForTimeout(1200);
  ok(/Pago pendiente/i.test(await statusText(c2)) && await c2.getByRole('button', { name: 'Pagar ahora' }).count() === 1, 'confirmación: «Pago pendiente» con botón «Pagar ahora»');
  const retry = c2.waitForResponse((r) => r.url().endsWith('/api/wompi/signature'), { timeout: 15000 });
  await c2.getByRole('button', { name: 'Pagar ahora' }).click();
  const sig2 = await (await retry).json();
  ok(sig2.reference === `${o2.number}-2`, `reintento con nueva referencia (${sig2.reference})`);
  const txId = `com-${stamp}-pend`;
  const pend = await webhook(sig2, 'PENDING', txId);
  ok(pend.status === 200 && orderRow(o2.number).status === 'payment_pending', `pago PENDIENTE → sigue «Pago pendiente» (${pend.body.result})`);
  const appr = await webhook(sig2, 'APPROVED', txId);
  ok(appr.status === 200 && orderRow(o2.number).status === 'paid', 'misma transacción pasa a APROBADA → pedido pagado');
  await c2.goto(`${B}/checkout/confirmacion?order=${o2.number}&token=${o2.token}`, { waitUntil: 'networkidle' }); await c2.waitForTimeout(1200);
  ok(/Pago confirmado/i.test(await statusText(c2)), 'el cliente recurrente ve «Pago confirmado»');

  // ------------------------------------------------------------------ 6. admin gestiona pedidos
  say('ADMIN gestiona el pedido del cliente nuevo: preparación → enviado (guía) → entregado');
  await adm.goto(B + '/admin/pedidos', { waitUntil: 'networkidle' }); await adm.waitForTimeout(1200);
  await adm.fill('input[placeholder*="Buscar" i]', o1.number); await adm.waitForTimeout(400);
  const advance = async (to, extra) => {
    await adm.locator('tr', { hasText: o1.number }).getByRole('button', { name: 'GESTIONAR' }).click();
    await adm.selectOption('#order-next-status', to); if (extra) await extra();
    await adm.getByRole('button', { name: 'GUARDAR CAMBIOS' }).click(); await adm.waitForTimeout(1500);
    return orderRow(o1.number).status;
  };
  ok(await advance('processing') === 'processing', 'pagado → en preparación');
  ok(await advance('shipped', async () => { await adm.fill('input[aria-label="Transportadora"]', 'Servientrega'); await adm.fill('input[aria-label="Número de guía"]', `GUIA${stamp}`); }) === 'shipped', 'en preparación → enviado con guía');
  ok(await advance('delivered') === 'delivered', 'enviado → entregado');
  await c1.goto(B + '/cuenta/pedidos', { waitUntil: 'networkidle' }); await c1.waitForTimeout(1500);
  const hist = (await c1.locator('body').innerText());
  ok(hist.includes(o1.number) && /Entregado/i.test(hist), 'el cliente nuevo ve su pedido «Entregado» en Mis pedidos');
  await c1.goto(`${B}/checkout/confirmacion?order=${o1.number}&token=${o1.token}`, { waitUntil: 'networkidle' }); await c1.waitForTimeout(1000);
  ok(await c1.getByText(`GUIA${stamp}`).count() >= 1, 'y la guía de envío');
  await adm.goto(B + '/admin/dashboard', { waitUntil: 'networkidle' }); await adm.waitForTimeout(1500);
  ok(await adm.locator('table tbody tr', { hasText: o2.number }).count() === 1, 'el dashboard lista el pedido reciente pagado');

  // ------------------------------------------------------------------ limpieza controlada
  say('limpieza: portada restaurada y producto archivado (los pedidos quedan como historial de prueba)');
  await adm.goto(B + '/admin/imagenes', { waitUntil: 'networkidle' });
  await adm.locator('[data-key=category_camisetas]').getByRole('button', { name: /Restaurar imagen/ }).click();
  await adm.getByRole('dialog', { name: 'Confirmar restauración' }).getByRole('button', { name: 'Restaurar' }).click(); await adm.waitForTimeout(1500);
  ok(sql(`select count(*) from site_content where key='category_camisetas'`) === '0', 'portada restaurada');
  const pid = sql(`select id from products where slug='${slug}'`);
  await adm.evaluate(async (id) => { const { adminService } = await import('/src/services/adminService.js'); await adminService.setProductStatus(id, 'archived'); }, pid);
  ok(sql(`select status from products where slug='${slug}'`) === 'archived', 'producto de prueba archivado');

  ok(errs.length === 0, `sin errores de página (${errs.join(' | ').slice(0, 200)})`);
  await browser.close();
  console.log(fails ? `RESULTADO: ${fails} FALLO(S)` : 'RESULTADO: PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR', e.message); process.exit(2); });
