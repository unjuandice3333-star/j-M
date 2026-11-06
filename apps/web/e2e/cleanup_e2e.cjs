// Fin del recorrido 3: el ADMINISTRADOR archiva el producto de prueba y desactiva el cupón de prueba (sin borrar nada).
const { st, setPassword, ADMIN_ID } = require('./lib_local.cjs');
(async () => {
  const pwd = await setPassword(ADMIN_ID);
  const tok = (await (await fetch(`${st.API_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: st.ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@qa.jm.test', password: pwd }) })).json()).access_token;
  const h = { apikey: st.ANON_KEY, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
  const prods = await (await fetch(`${st.API_URL}/rest/v1/products?select=id,slug,status&slug=like.camiseta-prueba-e2e-*`, { headers: h })).json();
  for (const p of prods) {
    const r = await fetch(`${st.API_URL}/rest/v1/rpc/admin_set_product_status`, { method: 'POST', headers: h, body: JSON.stringify({ p_product_id: p.id, p_status: 'archived' }) });
    console.log(`producto ${p.slug}: ${p.status} → archived (HTTP ${r.status})`);
  }
  const r2 = await fetch(`${st.API_URL}/rest/v1/coupons?code=like.E2E*`, { method: 'PATCH', headers: { ...h, Prefer: 'return=representation' }, body: JSON.stringify({ is_active: false }) });
  console.log('cupones de prueba desactivados:', (await r2.json()).map((c) => c.code).join(', '));
})();
