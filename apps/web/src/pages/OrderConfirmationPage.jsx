// =============================================================================
// Confirmación y seguimiento de pedido — estado REAL desde la BD (get_order_public: número + token público).
// M27: el pedido solo se muestra como pagado cuando la BD lo marca 'paid' (lo hace el webhook verificado de Wompi);
// volver del widget no paga nada. Mientras el pago está pendiente se consulta la BD periódicamente.
// =============================================================================
import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, Clock, XCircle, Truck, Package, CreditCard, AlertTriangle } from 'lucide-react';
import { useECommerceStore } from '../store/eCommerceStore';
import { formatCOP } from '../data/mockData';
import { analyticsService } from '../services/analytics';
import { orderService } from '../services/orderService';
import { wompiService } from '../services/wompi';

const POLL_MS = 5000;
const POLL_MAX = 36; // ~3 minutos

const STEPS = [
  { key: 'payment_pending', title: 'Pedido recibido', icon: Clock },
  { key: 'paid', title: 'Pago confirmado', icon: CreditCard },
  { key: 'processing', title: 'En preparación', icon: Package },
  { key: 'shipped', title: 'Enviado', icon: Truck },
  { key: 'delivered', title: 'Entregado', icon: CheckCircle2 },
];
const ORDER_FLOW = STEPS.map((s) => s.key);

export const OrderConfirmationPage = () => {
  const [searchParams] = useSearchParams();
  const orderNumber = searchParams.get('order');
  const token = searchParams.get('token');
  const payError = searchParams.get('pago') === 'error';
  const { orders, finalizePaidOrder } = useECommerceStore();

  const [order, setOrder] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | notfound | error
  const [polls, setPolls] = useState(0);
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);

  const fetchOrder = useCallback(async () => {
    if (!orderNumber || !token) { setState('notfound'); return null; }
    try {
      const data = await orderService.getPublicOrder(orderNumber, token);
      if (!data) { setState('notfound'); return null; }
      setOrder(data); setState('ready');
      return data;
    } catch {
      setState('error');
      return null;
    }
  }, [orderNumber, token]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  // Consulta periódica mientras el pago está pendiente (el webhook actualiza la BD)
  useEffect(() => {
    if (order?.status !== 'payment_pending' || polls >= POLL_MAX) return undefined;
    const t = setTimeout(async () => { await fetchOrder(); setPolls((n) => n + 1); }, POLL_MS);
    return () => clearTimeout(t);
  }, [order?.status, polls, fetchOrder]);

  // Vaciar el carrito solo cuando la BD confirma el pago del pedido de este checkout
  const local = orders.find((o) => o.order_number === orderNumber);
  useEffect(() => {
    if (order?.status === 'paid' && local) {
      if (finalizePaidOrder(local.id)) analyticsService.purchase({ ...order, id: order.order_number });
    }
  }, [order?.status, local, finalizePaidOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  const retryPayment = async () => {
    if (!local) { setActionError('Para reintentar el pago desde otro dispositivo, inicia sesión y abre el pedido en tu cuenta.'); return; }
    setBusy(true); setActionError(null);
    try {
      await wompiService.openWompiWidget({ order: local, customer: { email: order.customer_email, name: order.customer_name, phone: '' } });
    } catch (e) {
      setActionError(e.message);
    } finally { setBusy(false); }
  };

  const cancelOrder = async () => {
    if (!local) return;
    if (!window.confirm('¿Cancelar este pedido? Se liberarán los productos reservados.')) return;
    setBusy(true); setActionError(null);
    try { await orderService.cancelOrder(local.id, local.public_token, 'Cancelado por el cliente desde la confirmación'); await fetchOrder(); }
    catch (e) { setActionError(e.message); }
    finally { setBusy(false); }
  };

  if (state === 'loading') {
    return <div className="jm-container" style={{ padding: '5rem 0', textAlign: 'center' }} role="status">Consultando tu pedido…</div>;
  }
  if (state !== 'ready') {
    return (
      <div className="jm-container" style={{ padding: '4rem 0', maxWidth: '720px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '1rem' }}>
          {state === 'error' ? 'No pudimos consultar el pedido' : 'Pedido no encontrado'}
        </h1>
        <p style={{ color: '#71717A', marginBottom: '1.5rem' }}>
          {state === 'error' ? 'Revisa tu conexión e inténtalo de nuevo.' : 'El enlace no es válido. Si tienes cuenta, encuentra tus pedidos en "Mi cuenta".'}
        </p>
        {orders.length > 0 && (
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.5rem' }}>Pedidos hechos en este navegador</h2>
            <ul>
              {orders.map((o) => (
                <li key={o.id} style={{ marginBottom: '0.4rem' }}>
                  <Link to={`/checkout/confirmacion?order=${encodeURIComponent(o.order_number)}&token=${encodeURIComponent(o.public_token)}`} style={{ textDecoration: 'underline', fontWeight: 700 }}>
                    {o.order_number}
                  </Link>{' '}· {formatCOP(o.total)}
                </li>
              ))}
            </ul>
          </div>
        )}
        <Link to="/cuenta/pedidos" style={{ textDecoration: 'underline', fontWeight: 700 }}>Ir a mis pedidos</Link>
      </div>
    );
  }

  const st = order.status;
  const isPaidFlow = ['paid', 'processing', 'shipped', 'delivered'].includes(st);
  const isPending = st === 'payment_pending';
  const isClosed = ['cancelled', 'expired', 'refunded'].includes(st);
  const expiresAt = order.payment_expires_at ? new Date(order.payment_expires_at) : null;
  const reached = new Set((order.timeline ?? []).map((t) => t.to_status));

  return (
    <div style={{ backgroundColor: '#FFFFFF', padding: '3rem 0 5rem 0', minHeight: '85vh' }}>
      <div className="jm-container" style={{ maxWidth: '820px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }} role="status" aria-live="polite">
          {isPaidFlow && <CheckCircle2 size={60} color="#10B981" style={{ margin: '0 auto 1rem auto' }} />}
          {isPending && <Clock size={60} color="#D97706" style={{ margin: '0 auto 1rem auto' }} />}
          {isClosed && <XCircle size={60} color="#E11D48" style={{ margin: '0 auto 1rem auto' }} />}
          <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase',
            color: isPaidFlow ? '#10B981' : isPending ? '#D97706' : '#E11D48' }}>
            {order.status_label}
          </span>
          <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', margin: '0.4rem 0' }}>
            {isPaidFlow ? '¡Gracias por tu compra!' : isPending ? 'Pedido registrado' : 'Pedido cerrado'} · {order.order_number}
          </h1>
          <p style={{ fontSize: '0.95rem', color: '#71717A' }}>
            {isPaidFlow && `Confirmamos el pago. Te avisaremos a ${order.customer_email} cuando despachemos tu pedido.`}
            {isPending && (payError
              ? 'Tu pedido quedó registrado y los productos están reservados, pero no se pudo abrir el pago. Puedes reintentarlo.'
              : polls >= POLL_MAX
                ? 'Aún no recibimos la confirmación del pago. Si ya pagaste, la confirmación puede tardar unos minutos: recarga esta página.'
                : 'Esperando la confirmación del pago de Wompi… esta página se actualiza sola.')}
            {st === 'expired' && 'El tiempo para pagar este pedido terminó y la reserva se liberó.'}
            {st === 'cancelled' && 'Este pedido fue cancelado.'}
            {st === 'refunded' && 'Este pedido fue reembolsado.'}
          </p>
          {isPending && expiresAt && <p style={{ fontSize: '0.82rem', color: '#71717A' }}>Reserva válida hasta {expiresAt.toLocaleString('es-CO')}.</p>}
        </div>

        {actionError && <div role="alert" style={{ backgroundColor: '#FEF2F2', color: '#B91C1C', padding: '0.8rem 1rem', borderRadius: '8px', marginBottom: '1.5rem', fontWeight: 600 }}>{actionError}</div>}

        {isPending && (
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginBottom: '2rem', flexWrap: 'wrap' }}>
            <button onClick={retryPayment} disabled={busy} style={{ backgroundColor: '#09090B', color: '#FFF', padding: '0.85rem 1.4rem', borderRadius: '6px', fontWeight: 800 }}>
              {busy ? 'Procesando…' : 'Pagar ahora'}
            </button>
            {local && (
              <button onClick={cancelOrder} disabled={busy} style={{ border: '1px solid #D4D4D8', padding: '0.85rem 1.4rem', borderRadius: '6px', fontWeight: 700 }}>
                Cancelar pedido
              </button>
            )}
          </div>
        )}

        {!isClosed && (
          <ol aria-label="Estado del pedido" style={{ display: 'flex', justifyContent: 'space-between', listStyle: 'none', padding: 0, margin: '0 0 2.5rem 0', gap: '0.5rem' }}>
            {STEPS.map((s) => {
              const done = reached.has(s.key) || ORDER_FLOW.indexOf(st) >= ORDER_FLOW.indexOf(s.key);
              const Icon = s.icon;
              return (
                <li key={s.key} style={{ flex: 1, textAlign: 'center', color: done ? '#09090B' : '#A1A1AA', fontSize: '0.75rem', fontWeight: 700 }}>
                  <Icon size={22} style={{ margin: '0 auto 0.3rem auto' }} color={done ? '#10B981' : '#D4D4D8'} />
                  {s.title}
                </li>
              );
            })}
          </ol>
        )}

        {order.tracking?.tracking_number && (
          <div style={{ backgroundColor: '#F0FDF4', padding: '1rem 1.25rem', borderRadius: '8px', marginBottom: '2rem', fontSize: '0.9rem' }}>
            <strong>Guía de envío:</strong> {order.tracking.carrier} · {order.tracking.tracking_number}
            {order.tracking.tracking_url && <> · <a href={order.tracking.tracking_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Rastrear</a></>}
          </div>
        )}

        <section style={{ border: '1px solid #E4E4E7', borderRadius: '10px', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1rem', textTransform: 'uppercase' }}>Productos</h2>
          {(order.items ?? []).map((it, i) => (
            <div key={`${it.sku}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.5rem 0', borderBottom: '1px solid #F4F4F5', fontSize: '0.88rem' }}>
              <span>{it.product_name} · Talla {it.size_code} · {it.color_name} × {it.quantity}</span>
              <strong>{formatCOP(it.line_total)}</strong>
            </div>
          ))}
          <div style={{ display: 'grid', gap: '0.35rem', marginTop: '1rem', fontSize: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{formatCOP(order.subtotal)}</span></div>
            {Number(order.discount_total) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10B981' }}><span>Descuento{order.coupon_code ? ` (${order.coupon_code})` : ''}</span><span>-{formatCOP(order.discount_total)}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Envío</span><span>{Number(order.shipping_cost) === 0 ? 'GRATIS' : formatCOP(order.shipping_cost)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '1.1rem' }}><span>Total</span><span>{formatCOP(order.total)}</span></div>
          </div>
        </section>

        <section style={{ border: '1px solid #E4E4E7', borderRadius: '10px', padding: '1.5rem', marginBottom: '2rem', fontSize: '0.9rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.75rem', textTransform: 'uppercase' }}>Envío</h2>
          <div>{order.customer_name}</div>
          <div>{order.shipping?.address}{order.shipping?.neighborhood ? `, ${order.shipping.neighborhood}` : ''}</div>
          <div>{order.shipping?.city}, {order.shipping?.department}</div>
        </section>

        {isPending && !local && (
          <p style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: '#71717A', fontSize: '0.85rem' }}>
            <AlertTriangle size={16} /> Este pedido se creó en otro navegador: para pagarlo o cancelarlo, ábrelo desde ese navegador o desde tu cuenta.
          </p>
        )}
        <div style={{ textAlign: 'center' }}>
          <Link to="/ropa" style={{ textDecoration: 'underline', fontWeight: 700 }}>Seguir comprando</Link>
        </div>
      </div>
    </div>
  );
};

export default OrderConfirmationPage;
