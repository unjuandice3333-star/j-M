// Cancela (como cliente, con su token) los pedidos pendientes de los correos de prueba indicados: libera la reserva.
const { st } = require('./lib_local.cjs');
(async () => {
  const emails = process.argv.slice(2);
  for (const e of emails) {
    const rows = await (await fetch(`${st.API_URL}/rest/v1/online_orders?select=id,order_number,public_token&status=eq.payment_pending&customer_email=eq.${e}`, { headers: { apikey: st.SERVICE_ROLE_KEY, Authorization: `Bearer ${st.SERVICE_ROLE_KEY}` } })).json();
    for (const o of rows) {
      const r = await fetch(`${st.API_URL}/rest/v1/rpc/cancel_my_order`, { method: 'POST', headers: { apikey: st.ANON_KEY, Authorization: `Bearer ${st.ANON_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_order_id: o.id, p_public_token: o.public_token, p_reason: 'Liberación de reserva entre ejecuciones de prueba E2E' }) });
      console.log(`cancelado ${o.order_number}: HTTP ${r.status}`);
    }
  }
})();
