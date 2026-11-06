const { chromium } = require('playwright');
const { signedEvent } = require('./lib_wompi.cjs');
const B = 'http://127.0.0.1:3000';
(async () => {
  const browser = await chromium.launch(); const ctx = await browser.newContext(); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push('[pageerror] ' + e.message.slice(0, 200)));
  p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|net::ERR|wompi\.co/.test(m.text())) errs.push('[console] ' + m.text().slice(0, 200)); });
  const step = (t) => console.log('▶ ' + t);
  step('ficha: Camisa Oxford, talla con stock, 1 unidad');
  await p.goto(B + '/producto/camisa-oxford-slim', { waitUntil: 'networkidle' });
  await p.locator('#size-selector-container button[aria-label^="Talla"]:not([disabled])').first().click();
  await p.getByRole('button', { name: 'AGREGAR AL CARRITO', exact: true }).first().click();
  step('carrito: aplicar cupón inválido y luego QA10');
  await p.goto(B + '/carrito', { waitUntil: 'networkidle' });
  await p.getByLabel('Código del cupón').fill('NOEXISTE'); await p.getByRole('button', { name: 'APLICAR' }).click();
  await p.waitForTimeout(800); console.log('  cupón inválido →', (await p.locator('text=/no existe|no es válido/i').first().textContent().catch(() => '¿sin mensaje?')).trim());
  await p.getByLabel('Código del cupón').fill('QA10'); await p.getByRole('button', { name: 'APLICAR' }).click();
  await p.waitForTimeout(1500);
  const resumen = (await p.getByText(/^TOTAL( ESTIMADO)?$/).locator('..').innerText()).replace(/\s+/g, ' ');
  console.log('  ', (await p.getByText(/Descuento Cupón/).locator('..').innerText().catch(() => 'sin descuento')).replace(/\s+/g, ' '), '|', resumen);
  step('checkout: enviar vacío (validación) y luego completo');
  await p.goto(B + '/checkout', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /CONFIRMAR Y PAGAR/ }).click();
  console.log('  errores de campo:', await p.locator('[role=alert]').count());
  await p.fill('input[name=firstName]', 'Laura'); await p.fill('input[name=lastName]', 'Prueba E2E');
  await p.fill('input[name=email]', 'laura.e2e@qa.jm.test'); await p.fill('input[name=phone]', '3001234567');
  await p.selectOption('select[name=department]', 'Antioquia'); await p.fill('input[name=city]', 'Medellín');
  await p.fill('input[name=address]', 'Carrera 43A # 1-50'); await p.fill('input[name=neighborhood]', 'El Poblado');
  await p.waitForTimeout(800);
  const sigResp = p.waitForResponse((r) => r.url().endsWith('/api/wompi/signature'), { timeout: 15000 }).catch(() => null);
  await p.getByRole('button', { name: /CONFIRMAR Y PAGAR/ }).click();
  const sr = await sigResp; const sig = sr ? await sr.json() : null;
  console.log('  firma:', sr?.status(), sig ? `${sig.reference} · ${sig.amount_in_cents} · firma ${sig.signature?.slice(0, 8)}…` : 'sin respuesta');
  await p.waitForURL(/\/checkout\/confirmacion/, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1500);
  console.log('  confirmación:', p.url().replace(B, ''), '|', (await p.locator('h1').first().innerText()).replace(/\s+/g, ' '));
  if (sig) {
    step('webhook Wompi simulado (APPROVED, firmado con el secreto de eventos local)');
    const ev = signedEvent({ reference: sig.reference, amountInCents: sig.amount_in_cents, status: 'APPROVED', txId: `e2e-${Date.now()}`, secret: process.env.WOMPI_EVENTS_SECRET });
    for (const n of [1, 2]) {
      const r = await fetch(B + '/api/wompi/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ev) });
      console.log(`  webhook #${n}:`, r.status, JSON.stringify(await r.json()));
    }
    await p.waitForTimeout(6500);
    console.log('  confirmación tras webhook:', (await p.locator('h1').first().innerText()).replace(/\s+/g, ' '));
    const cart = await p.evaluate(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14')).state.items.length);
    console.log('  carrito vaciado tras pago confirmado:', cart === 0);
  }
  console.log(errs.length ? errs.join('\n') : '  sin errores de consola');
  await browser.close();
})();
