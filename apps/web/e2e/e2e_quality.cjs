// RECORRIDO 2 (cliente recurrente) + calidad: móvil/escritorio, desbordes horizontales, errores de consola, peticiones fallidas
const { chromium, devices } = require('playwright');
const { setPassword, CLIENTE1_ID, ADMIN_ID } = require('./lib_local.cjs');
const B = 'http://localhost:3000'; const SHOTS = process.env.SHOTS || require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'jm-shots-'));
const IGN = /TUNNEL|net::ERR_|Failed to load resource: net|unsplash|React Router Future Flag/;
(async () => {
  const browser = await chromium.launch(); const say = (t) => console.log('▶ ' + t);
  say('RECORRIDO 2: cliente recurrente');
  const pwd = await setPassword(CLIENTE1_ID);
  const ctx = await browser.newContext(); const p = await ctx.newPage();
  await p.goto(B + '/cuenta', { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', 'cliente1@qa.jm.test'); await p.fill('input[type=password]', pwd);
  await p.getByRole('button', { name: /^Iniciar sesión$/ }).click(); await p.waitForTimeout(1500);
  await p.goto(B + '/producto/camisa-oxford-slim', { waitUntil: 'networkidle' });
  await p.locator('#size-selector-container button[aria-label^="Talla"]:not([disabled])').first().click();
  await p.getByRole('button', { name: 'AGREGAR AL CARRITO', exact: true }).first().click(); await p.waitForTimeout(400);
  await p.goto(B + '/', { waitUntil: 'networkidle' }); await p.reload({ waitUntil: 'networkidle' });
  const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14')).state.items.length);
  console.log('  carrito recuperado tras recargar:', kept, 'línea(s)');
  await p.goto(B + '/checkout', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  await p.fill('input[name=phone]', '3000000001'); await p.selectOption('select[name=department]', 'Cundinamarca');
  await p.fill('input[name=city]', 'Chía'); await p.fill('input[name=address]', 'Calle 7 # 10-20');
  await p.getByRole('button', { name: /CONFIRMAR Y PAGAR/ }).click(); await p.waitForURL(/confirmacion/, { timeout: 20000 }).catch(() => {});
  console.log('  segunda compra:', new URL(p.url()).searchParams.get('order'));
  await p.goto(B + '/cuenta/pedidos', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  console.log('  pedidos en el historial:', await p.getByText(/^PEDIDO #JM-/).count());
  await p.getByText(/cerrar sesión/i).first().click(); await p.waitForTimeout(800);
  console.log('  sesión cerrada:', await p.locator('input[type=password]').count() > 0);

  say('calidad visual y técnica (escritorio y móvil)');
  const routes = ['/', '/ropa', '/producto/camiseta-heavyweight-oversize', '/carrito', '/checkout', '/cuenta', '/buscar?q=camisa', '/ofertas', '/guia-de-tallas'];
  for (const [name, opts] of [['desktop', { viewport: { width: 1366, height: 900 } }], ['mobile', { ...devices['iPhone 13'] }]]) {
    const c = await browser.newContext(opts); const pg = await c.newPage(); const issues = [];
    pg.on('console', (m) => { if (['error'].includes(m.type()) && !IGN.test(m.text())) issues.push(m.text().slice(0, 120)); });
    pg.on('pageerror', (e) => issues.push('pageerror ' + e.message.slice(0, 120)));
    pg.on('response', (r) => { if (r.url().includes(':54321') && r.status() >= 400) issues.push(`HTTP ${r.status()} ${r.url().replace(/^.*:54321/, '').slice(0, 80)}`); });
    // carrito con un producto para que checkout/carrito tengan contenido
    await pg.goto(B + '/producto/jean-slim-selvedge', { waitUntil: 'networkidle' });
    await pg.locator('#size-selector-container button[aria-label^="Talla"]:not([disabled])').first().click();
    await pg.getByRole('button', { name: 'AGREGAR AL CARRITO', exact: true }).first().click(); await pg.waitForTimeout(300);
    for (const r of routes) {
      await pg.goto(B + r, { waitUntil: 'networkidle' }); await pg.waitForTimeout(500);
      const overflow = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      await pg.screenshot({ path: `${SHOTS}/${name}${r.replace(/[/?=&]/g, '_')}.png`, fullPage: false });
      if (overflow > 1) issues.push(`desborde horizontal de ${overflow}px en ${r}`);
    }
    console.log(`  ${name}: ${issues.length ? [...new Set(issues)].join(' | ') : 'sin errores de consola, sin peticiones fallidas, sin desbordes'}`);
    await c.close();
  }
  say('panel admin en móvil');
  const apwd = await setPassword(ADMIN_ID);
  const ac = await browser.newContext({ ...devices['iPhone 13'] }); const ap = await ac.newPage(); const aIssues = [];
  ap.on('pageerror', (e) => aIssues.push('pageerror ' + e.message.slice(0, 120)));
  ap.on('response', (r) => { if (r.url().includes(':54321') && r.status() >= 400) aIssues.push(`HTTP ${r.status()} ${r.url().replace(/^.*:54321/, '').slice(0, 80)}`); });
  await ap.goto(B + '/admin/login', { waitUntil: 'networkidle' });
  await ap.fill('input[type=email]', 'admin@qa.jm.test'); await ap.fill('input[type=password]', apwd);
  await ap.locator('form button[type=submit]').first().click(); await ap.waitForURL(/dashboard/, { timeout: 15000 }).catch(() => {});
  for (const r of ['/admin/dashboard', '/admin/productos', '/admin/pedidos', '/admin/inventario', '/admin/clientes', '/admin/descuentos', '/admin/reviews']) {
    await ap.goto(B + r, { waitUntil: 'networkidle' }); await ap.waitForTimeout(600);
    await ap.screenshot({ path: `${SHOTS}/admin_mobile${r.replace(/\//g, '_')}.png` });
  }
  console.log('  admin móvil:', aIssues.length ? [...new Set(aIssues)].join(' | ') : 'sin errores ni peticiones fallidas');
  await browser.close();
})();
