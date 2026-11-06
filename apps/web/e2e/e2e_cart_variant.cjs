// M28 — Cambio de talla/color dentro del carrito. Navegador real contra el stack LOCAL.
// Dato de prueba controlado: precio especial temporal (price_override) en una variante, revertido al final.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const { st } = require('./lib_local.cjs');
const B = 'http://localhost:3000'; const SLUG = 'camiseta-heavyweight-oversize'; const NAME = 'Camiseta Heavyweight Oversize';
let fails = 0; const ok = (c, m) => { console.log(`${c ? '  ✔' : '  ✘'} ${m}`); if (!c) fails++; };
const sql = (q) => execFileSync('psql', [st.DB_URL, '-Atc', q], { encoding: 'utf8' }).trim();
const VARIANT = (color, size) => `(select v.id from variants v join products p on p.id=v.product_id join colors c on c.id=v.color_id join sizes s on s.id=v.size_id where p.slug='${SLUG}' and c.name='${color}' and s.code='${size}')`;
const cart = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14')).state.items.map((i) => ({ v: i.variantId, size: i.size, color: i.color, q: i.quantity, price: i.price })));
const sizeSel = (p) => p.locator(`select[aria-label="Talla de ${NAME}"]`);
const colorSel = (p) => p.locator(`select[aria-label="Color de ${NAME}"]`);
async function addFromPdp(p, color, size, qty) {
  await p.goto(`${B}/producto/${SLUG}`, { waitUntil: 'networkidle' });
  await p.locator(`button[aria-label="Color ${color}"]`).click();
  await p.locator(`#size-selector-container button[aria-label="Talla ${size}"]`).click();
  for (let i = 1; i < qty; i++) await p.locator('button[aria-label="Aumentar cantidad"]').click();
  await p.getByRole('button', { name: 'AGREGAR AL CARRITO', exact: true }).first().click(); await p.waitForTimeout(400);
}
async function quote(items) {
  const r = await fetch(`${st.API_URL}/rest/v1/rpc/quote_cart`, { method: 'POST', headers: { apikey: st.ANON_KEY, Authorization: `Bearer ${st.ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_items: items.map((i) => ({ variant_id: i.v, quantity: i.q })), p_coupon_code: null, p_shipping_method: 'standard', p_email: null }) });
  return r.json();
}

(async () => {
  const XXL = sql(`select ${VARIANT('Negro', 'XXL')}`);
  sql(`update variants set price_override = 95000 where id = '${XXL}'`);
  const browser = await chromium.launch(); const errs = [];
  const p = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  try {
    console.log('▶ Negro M ×3 al carrito');
    await addFromPdp(p, 'Negro', 'M', 3);
    await p.goto(B + '/carrito', { waitUntil: 'networkidle' });
    let c = await cart(p);
    ok(c.length === 1 && c[0].size === 'M' && c[0].q === 3, `línea inicial Negro M ×3 (${JSON.stringify(c.map((i) => i.size + 'x' + i.q))})`);

    console.log('▶ cambiar a XXL (solo 2 disponibles) con cantidad 3 → rechazado sin tocar el carrito');
    await sizeSel(p).selectOption('XXL');
    ok(await p.getByRole('alert').filter({ hasText: 'Solo hay 2' }).count() === 1, 'mensaje «Solo hay 2 unidad(es)…»');
    c = await cart(p); ok(c.length === 1 && c[0].size === 'M' && c[0].q === 3, 'carrito intacto (Negro M ×3)');
    ok(await sizeSel(p).inputValue() === 'M', 'el selector vuelve a M');

    console.log('▶ cambiar el color a Blanco crudo (conserva talla M) y comprobar talla agotada deshabilitada');
    await colorSel(p).selectOption('Blanco crudo'); await p.waitForTimeout(300);
    c = await cart(p); ok(c.length === 1 && c[0].color === 'Blanco crudo' && c[0].size === 'M' && c[0].q === 3, 'línea pasa a Blanco crudo M ×3');
    ok(c[0].v === sql(`select ${VARIANT('Blanco crudo', 'M')}`), 'variant_id real de Blanco crudo M');
    ok(await sizeSel(p).locator('option[value="L"]').evaluate((o) => o.disabled), 'talla L (agotada en Blanco crudo) deshabilitada');
    await colorSel(p).selectOption('Negro'); await p.waitForTimeout(300);

    console.log('▶ cantidad 2 y cambio a XXL → precio de la variante (95.000) y cotización de la BD');
    await p.getByRole('button', { name: `Disminuir cantidad de ${NAME}` }).click();
    await sizeSel(p).selectOption('XXL'); await p.waitForTimeout(1200);
    c = await cart(p); ok(c.length === 1 && c[0].size === 'XXL' && c[0].q === 2 && c[0].price === 95000, `Negro XXL ×2 a 95.000 (${c[0]?.price})`);
    const q = await quote(c);
    ok(Number(q.subtotal) === 190000 && q.lines?.[0]?.in_stock !== false, `quote_cart (BD): subtotal ${q.subtotal}`);
    const pageText = (await p.locator('body').innerText()).replace(/\s+/g, ' ');
    ok(pageText.includes('190.000'), 'el carrito muestra el subtotal de la BD (190.000)');

    console.log('▶ fusión: añadir Negro S ×1 y pasar la línea XXL a S');
    await addFromPdp(p, 'Negro', 'S', 1);
    await p.goto(B + '/carrito', { waitUntil: 'networkidle' });
    await sizeSel(p).first().selectOption('S'); await p.waitForTimeout(400);
    c = await cart(p); ok(c.length === 1 && c[0].size === 'S' && c[0].q === 3, `líneas fusionadas: Negro S ×3 (${JSON.stringify(c.map((i) => i.size + 'x' + i.q))})`);
    ok(await p.getByRole('status').filter({ hasText: 'Unimos' }).count() === 1, 'aviso de fusión');

    console.log('▶ fusión que excede el stock: Negro XL ×3 + línea S ×3 → XL (4 disp.) rechazado');
    await addFromPdp(p, 'Negro', 'XL', 3);
    await p.goto(B + '/carrito', { waitUntil: 'networkidle' });
    const before = await cart(p);
    const sSel = p.locator(`select[aria-label="Talla de ${NAME}"]`).filter({ has: p.locator('option[value="S"]:checked') });
    await sSel.selectOption('XL'); await p.waitForTimeout(300);
    ok(await p.getByRole('alert').filter({ hasText: 'Ya tienes 3' }).count() === 1, 'mensaje «Ya tienes 3 en XL / Negro; solo hay 4»');
    c = await cart(p); ok(JSON.stringify(c) === JSON.stringify(before), 'carrito sin cambios (sin cantidades incorrectas)');
    const total = c.reduce((n, i) => n + i.q, 0);
    ok(total === 6, `unidades totales correctas (${total})`);
    const q2 = await quote(c); ok(q2.lines?.every((l) => l.in_stock), 'la BD confirma stock para todas las líneas');
  } finally {
    sql(`update variants set price_override = null where id = '${XXL}'`);
    console.log('  (precio especial de prueba revertido)');
  }
  ok(errs.length === 0, `sin errores de página (${errs.join(' | ').slice(0, 200)})`);
  await browser.close();
  console.log(fails ? `RESULTADO: ${fails} FALLO(S)` : 'RESULTADO: PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR', e.message); try { execFileSync('psql', [st.DB_URL, '-Atc', "update variants set price_override=null where price_override=95000"]); } catch {} process.exit(2); });
