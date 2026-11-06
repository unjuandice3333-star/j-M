const { chromium } = require('playwright');
const { setPassword, ADMIN_ID, CLIENTE1_ID, st } = require('./lib_local.cjs');
const B = 'http://localhost:3000';
const ORDER = process.env.ORDER || 'JM-001008';
(async () => {
  const browser = await chromium.launch(); const say = (t) => console.log('▶ ' + t);
  // ---------------- gestión de pedido por el administrador
  const adm = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const apwd = await setPassword(ADMIN_ID);
  await adm.goto(B + '/admin/login', { waitUntil: 'networkidle' });
  await adm.fill('input[type=email]', 'admin@qa.jm.test'); await adm.fill('input[type=password]', apwd);
  await adm.locator('form button[type=submit]').first().click(); await adm.waitForURL(/dashboard/, { timeout: 15000 });
  await adm.goto(B + '/admin/pedidos', { waitUntil: 'networkidle' }); await adm.waitForTimeout(1200);
  say(`buscar ${ORDER} y avanzar estados`);
  await adm.fill('input[placeholder*="Buscar" i], input[type=text]', ORDER); await adm.waitForTimeout(400);
  const advance = async (to, extra) => {
    await adm.locator('tr', { hasText: ORDER }).getByRole('button', { name: 'GESTIONAR' }).click();
    await adm.selectOption('#order-next-status', to); if (extra) await extra();
    await adm.getByRole('button', { name: 'GUARDAR CAMBIOS' }).click(); await adm.waitForTimeout(1500);
    const msg = await adm.locator('[role=status], [role=alert]').first().innerText().catch(() => '¿?');
    console.log(`  → ${to}: ${msg.slice(0, 90)}`);
  };
  await advance('processing');
  // intento de enviar sin guía (debe rechazarse en el formulario)
  await adm.locator('tr', { hasText: ORDER }).getByRole('button', { name: 'GESTIONAR' }).click();
  await adm.selectOption('#order-next-status', 'shipped'); await adm.getByRole('button', { name: 'GUARDAR CAMBIOS' }).click(); await adm.waitForTimeout(500);
  console.log('  enviar sin guía →', (await adm.locator('[role=dialog] [role=alert], .modal-overlay div[style*="FEF2F2"]').first().innerText().catch(() => '¿?')).slice(0, 80));
  await adm.keyboard.press('Escape'); await adm.locator('.modal-overlay').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await advance('shipped', async () => { await adm.fill('input[aria-label="Transportadora"]', 'Coordinadora'); await adm.fill('input[aria-label="Número de guía"]', '123456789'); });
  // ---------------- el cliente ve el cambio (enlace de seguimiento con token)
  say('el cliente consulta su pedido');
  const tok = (await (await fetch(`${st.API_URL}/rest/v1/online_orders?select=public_token&order_number=eq.${ORDER}`, { headers: { apikey: st.SERVICE_ROLE_KEY, Authorization: `Bearer ${st.SERVICE_ROLE_KEY}` } })).json())[0].public_token;
  const cli = await (await browser.newContext()).newPage();
  await cli.goto(`${B}/checkout/confirmacion?order=${ORDER}&token=${tok}`, { waitUntil: 'networkidle' }); await cli.waitForTimeout(800);
  console.log('  cliente ve:', (await cli.locator('[role=status]').first().innerText()).replace(/\s+/g, ' ').slice(0, 70), '| guía:', await cli.getByText('123456789').count() > 0);
  // ---------------- RECORRIDO 4: seguridad funcional
  say('seguridad: cliente intenta entrar al panel y ejecutar operaciones admin');
  const cpwd = await setPassword(CLIENTE1_ID);
  const cp = await (await browser.newContext()).newPage();
  await cp.goto(B + '/cuenta', { waitUntil: 'networkidle' });
  await cp.fill('input[type=email]', 'cliente1@qa.jm.test'); await cp.fill('input[type=password]', cpwd);
  await cp.getByRole('button', { name: /^Iniciar sesión$/ }).click(); await cp.waitForTimeout(2000);
  for (const r of ['/admin/dashboard', '/admin/productos/nuevo', '/admin/pedidos']) {
    await cp.goto(B + r, { waitUntil: 'networkidle' }); await cp.waitForTimeout(600);
    console.log(`  cliente → ${r}: termina en ${cp.url().replace(B, '')}`);
  }
  const backend = await cp.evaluate(async ({ url, anon }) => {
    const raw = Object.keys(localStorage).find((k) => k.includes('auth-token'));
    const jwt = JSON.parse(localStorage.getItem(raw)).access_token;
    const h = { apikey: anon, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
    const call = async (path, body, method = 'POST') => { const r = await fetch(url + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); return `${r.status} ${(await r.text()).slice(0, 70)}`; };
    return {
      dashboard: await call('/rest/v1/rpc/admin_dashboard_metrics', {}),
      transition: await call('/rest/v1/rpc/admin_transition_order', { p_order_id: '00000000-0000-0000-0000-000000000000', p_to: 'paid' }),
      upsert: await call('/rest/v1/rpc/admin_upsert_product', { p: { category: 'camisetas', colors: [{ color: 'negro' }] } }),
      role: await call('/rest/v1/rpc/admin_set_user_role', { p_user_id: '00000000-0000-4000-8000-00000000a003', p_role: 'admin' }),
      inventories: await call('/rest/v1/inventories?select=id&limit=1', null, 'GET'),
      coupons: await call('/rest/v1/coupons?select=code&limit=1', null, 'GET'),
      others_orders: await call('/rest/v1/online_orders?select=order_number', null, 'GET'),
      selfPromote: await call('/rest/v1/profiles?id=eq.00000000-0000-4000-8000-00000000a003', { role: 'admin' }, 'PATCH'),
      priceEdit: await call('/rest/v1/products?slug=eq.camisa-oxford-slim', { base_price: 1 }, 'PATCH'),
    };
  }, { url: st.API_URL, anon: st.ANON_KEY });
  for (const [k, v] of Object.entries(backend)) console.log(`  backend ${k}: ${v}`);
  const role = (await (await fetch(`${st.API_URL}/rest/v1/profiles?select=role&id=eq.${CLIENTE1_ID}`, { headers: { apikey: st.SERVICE_ROLE_KEY, Authorization: `Bearer ${st.SERVICE_ROLE_KEY}` } })).json())[0].role;
  const price = (await (await fetch(`${st.API_URL}/rest/v1/products?select=base_price&slug=eq.camisa-oxford-slim`, { headers: { apikey: st.SERVICE_ROLE_KEY, Authorization: `Bearer ${st.SERVICE_ROLE_KEY}` } })).json())[0].base_price;
  console.log(`  verificación BD: rol de cliente1 = ${role}; precio camisa = ${price}`);
  await browser.close();
})();
