// =============================================================================
// Ejecución 118 — Aviso en el checkout cuando el pedido del checkout anterior sigue pendiente de pago.
// Antes: si el cliente cerraba Wompi (o el pago fallaba), volvía y confirmaba otra vez, se creaba un pedido NUEVO y el
// anterior seguía reservando stock hasta vencer, sin que el cliente lo supiera. Ahora el checkout consulta el estado
// REAL del pedido en la BD (get_order_public: número + token) y, si sigue pendiente y dentro de su ventana de pago,
// ofrece pagarlo o cancelarlo (cancel_my_order libera la reserva). Si ya está pagado se descuentan sus líneas del
// carrito (finalizePaidOrder); si está cancelado o vencido deja de ser el pedido activo.
// =============================================================================
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useECommerceStore } from '../../store/eCommerceStore';
import { orderService } from '../../services/orderService';
import { formatCOP } from '../../utils/currency';

const PAID = new Set(['paid', 'processing', 'shipped', 'delivered']);

/** Mismas variantes y cantidades (el orden de las líneas no importa). */
export const sameCheckoutLines = (cartItems, boughtItems) => {
  if (!Array.isArray(boughtItems)) return false;
  const count = (list) => list.reduce((m, i) => m.set(i.variantId, (m.get(i.variantId) || 0) + (Number(i.quantity) || 0)), new Map());
  const a = count(cartItems);
  const b = count(boughtItems);
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
};

const isOpen = (status, expiresAt, now = Date.now()) =>
  status === 'payment_pending' && (!expiresAt || new Date(expiresAt).getTime() > now);

const timeOf = (iso) => {
  try { return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }); } catch { return null; }
};

export const PendingOrderNotice = () => {
  const items = useECommerceStore((s) => s.items);
  const activeId = useECommerceStore((s) => s.activeCheckoutOrderId);
  const bought = useECommerceStore((s) => s.activeCheckoutItems);
  const local = useECommerceStore((s) => s.orders.find((o) => o.id === s.activeCheckoutOrderId) ?? null);
  const [pending, setPending] = useState(null); // { status, expiresAt, total } confirmado por la BD
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [cancelled, setCancelled] = useState(null); // número del pedido cancelado desde aquí

  const orderNumber = local?.order_number;
  const token = local?.public_token;
  useEffect(() => {
    setPending(null);
    if (!activeId || !orderNumber || !token) return undefined;
    let alive = true;
    orderService.getPublicOrder(orderNumber, token).then((data) => {
      if (!alive) return;
      const store = useECommerceStore.getState();
      if (!data) { store.releaseActiveCheckout(activeId); return; }
      if (isOpen(data.status, data.payment_expires_at)) {
        setPending({ status: data.status, expiresAt: data.payment_expires_at, total: Number(data.total) });
      } else if (PAID.has(data.status)) {
        store.finalizePaidOrder(activeId); // pagado en otra pestaña: se descuentan sus líneas del carrito
      } else {
        store.releaseActiveCheckout(activeId, data.status === 'payment_pending' ? 'expired' : data.status);
      }
    }).catch(() => {
      // Sin conexión con la BD: se avisa con lo que sabe el navegador, sin tocar el estado.
      if (alive && isOpen(local?.status, local?.payment_expires_at)) {
        setPending({ status: local.status, expiresAt: local.payment_expires_at, total: Number(local.total) });
      }
    });
    return () => { alive = false; };
  }, [activeId, orderNumber, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = async () => {
    if (!window.confirm(`¿Cancelar el pedido ${orderNumber}? Se liberarán los productos reservados.`)) return;
    setBusy(true); setError(null);
    try {
      await orderService.cancelOrder(activeId, token, 'Cancelado por el cliente desde el checkout');
      useECommerceStore.getState().releaseActiveCheckout(activeId, 'cancelled');
      setCancelled(orderNumber);
      setPending(null);
    } catch (e) {
      setError(e.message || 'No se pudo cancelar el pedido.');
    } finally { setBusy(false); }
  };

  if (cancelled) {
    return (
      <div role="status" data-testid="pending-order-cancelled" style={{ ...boxStyle, backgroundColor: '#ECFDF5', borderColor: '#6EE7B7', color: '#065F46' }}>
        Pedido {cancelled} cancelado. Al confirmar se creará un pedido nuevo con tu carrito actual.
      </div>
    );
  }
  if (!pending || !local) return null;

  const same = sameCheckoutLines(items, bought);
  const until = pending.expiresAt ? timeOf(pending.expiresAt) : null;
  const link = `/checkout/confirmacion?order=${encodeURIComponent(orderNumber)}&token=${encodeURIComponent(token)}`;
  return (
    <section role="status" aria-labelledby="pending-order-title" data-testid="pending-order-notice" data-same-cart={same ? 'true' : 'false'} style={boxStyle}>
      <h2 id="pending-order-title" style={{ fontSize: '0.95rem', fontWeight: 900, margin: 0, textTransform: 'uppercase' }}>
        Tienes un pedido pendiente de pago
      </h2>
      <p style={{ margin: 0 }}>
        El pedido <strong>{orderNumber}</strong> ({formatCOP(pending.total)}) reserva sus productos{until ? ` hasta las ${until}` : ''}.{' '}
        {same
          ? 'Tiene los mismos productos que tu carrito: puedes pagarlo sin crear otro pedido.'
          : 'Tu carrito cambió desde entonces: si confirmas, se creará un pedido nuevo y el anterior seguirá reservando stock hasta vencer. Puedes pagarlo o cancelarlo.'}
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Link to={link} data-testid="pending-order-pay" style={{ ...btnStyle, backgroundColor: '#09090B', color: '#FFFFFF' }}>
          Pagar ese pedido
        </Link>
        <button type="button" onClick={cancel} disabled={busy} data-testid="pending-order-cancel" style={{ ...btnStyle, backgroundColor: '#FFFFFF', color: '#92400E', border: '1px solid #92400E' }}>
          {busy ? 'Cancelando…' : 'Cancelar ese pedido'}
        </button>
      </div>
      {error && <p role="alert" style={{ margin: 0, color: '#991B1B', fontWeight: 700 }}>{error}</p>}
    </section>
  );
};

const boxStyle = {
  display: 'grid', gap: '0.6rem', backgroundColor: '#FFFBEB', color: '#78350F', padding: '1rem 1.5rem', borderRadius: 8,
  marginBottom: '2rem', border: '1px solid #FCD34D', fontWeight: 600, fontSize: '0.9rem',
};
const btnStyle = {
  display: 'inline-flex', alignItems: 'center', minHeight: '40px', padding: '0.5rem 1.1rem', borderRadius: '6px',
  fontWeight: 800, fontSize: '0.85rem', textDecoration: 'none', cursor: 'pointer',
};

export default PendingOrderNotice;
