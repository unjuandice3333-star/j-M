// =============================================================================
// Confirmación y seguimiento de pedido — estado REAL desde la BD (get_order_public: número + token público).
// M27: el pedido solo se muestra como pagado cuando la BD lo marca 'paid' (lo hace el webhook verificado de Wompi);
// volver del widget no paga nada. Mientras el pago está pendiente se consulta la BD periódicamente.
// Ejecución 58: el enlace (número + token) basta para pagar o cancelar desde cualquier navegador; get_order_public
// devuelve el id y las RPC siguen exigiendo el token. Si la BD rechaza el pago (vencido, ya no pagable), se relee.
// =============================================================================
import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, Clock, XCircle, Truck, Package, CreditCard, AlertTriangle, RotateCcw } from '../components/Common/icons';
import { useECommerceStore } from '../store/eCommerceStore';
import { formatCOP } from '../utils/currency';
import { analyticsService } from '../services/analytics';
import { orderService } from '../services/orderService';
import { wompiService } from '../services/wompi';
import { shippingMethodLabel } from '../utils/shippingPolicy';
import { useAuthStore } from '../store/authStore';
import { orderReviewMessage, orderRefundMessage, orderPaidCancellationMessage } from '../utils/orderReview';

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
// Respuestas de /api/wompi/signature que indican que el estado mostrado quedó viejo.
const STALE_PAYMENT_CODES = new Set(['JM_ORDER_NOT_PAYABLE', 'JM_PAYMENT_WINDOW_EXPIRED', 'JM_ORDER_NOT_FOUND']);

/** Enlace de seguimiento sin datos extra (sin `pago=error`): número + token público. */
export const orderTrackingUrl = (origin, orderNumber, token) =>
  `${origin}/checkout/confirmacion?order=${encodeURIComponent(orderNumber)}&token=${encodeURIComponent(token)}`;

/**
 * Ejecución 116 (D88): un pedido hecho sin sesión no aparece en «Mi cuenta» aunque luego se cree una cuenta con el
 * mismo correo (RLS: user_id = auth.uid()). No hay correo transaccional: este enlace es su acceso desde otro dispositivo.
 */
const GuestOrderLink = ({ orderNumber, token }) => {
  const url = orderTrackingUrl(window.location.origin, orderNumber, token);
  const [copyState, setCopyState] = useState(null); // null | 'ok' | 'fail'
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('sin portapapeles');
      await navigator.clipboard.writeText(url);
      setCopyState('ok');
    } catch {
      setCopyState('fail');
    }
  };
  return (
    <section data-testid="guest-order-link" aria-labelledby="guest-order-link-title" style={{ border: '1px solid #E4E4E7', borderRadius: '10px', padding: '1.25rem 1.5rem', marginBottom: '2rem', fontSize: '0.9rem', backgroundColor: '#FAFAFA' }}>
      <h2 id="guest-order-link-title" style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.5rem', textTransform: 'uppercase' }}>Guarda el enlace de tu pedido</h2>
      <p style={{ color: '#52525B', margin: '0 0 0.75rem 0' }}>
        Compraste sin iniciar sesión: este pedido no aparecerá en «Mi cuenta», aunque luego crees una cuenta con este correo. Con este enlace puedes consultarlo, pagarlo o cancelarlo desde cualquier dispositivo. No lo compartas: muestra tu nombre y dirección.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <label htmlFor="guest-order-url" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Enlace del pedido</label>
        <input id="guest-order-url" readOnly value={url} onFocus={(e) => e.target.select()}
          style={{ flex: '1 1 220px', minWidth: 0, minHeight: '36px', padding: '0.4rem 0.6rem', border: '1px solid #D4D4D8', borderRadius: '6px', fontSize: '0.8rem', color: '#3F3F46', backgroundColor: '#FFFFFF' }} />
        <button type="button" onClick={copy} style={{ minHeight: '36px', backgroundColor: '#09090B', color: '#FFFFFF', padding: '0.4rem 1rem', borderRadius: '6px', fontWeight: 800 }}>
          Copiar enlace
        </button>
      </div>
      <p role="status" style={{ minHeight: '1.2em', margin: '0.5rem 0 0 0', fontSize: '0.82rem', color: copyState === 'fail' ? '#B91C1C' : '#047857', fontWeight: 600 }}>
        {copyState === 'ok' && 'Enlace copiado.'}
        {copyState === 'fail' && 'No se pudo copiar: selecciona el enlace y cópialo manualmente.'}
      </p>
    </section>
  );
};

export const OrderConfirmationPage = () => {
  const [searchParams] = useSearchParams();
  const orderNumber = searchParams.get('order');
  const token = searchParams.get('token');
  const payError = searchParams.get('pago') === 'error';
  const { orders, finalizePaidOrder, shippingMethods, rememberOrder } = useECommerceStore();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const authLoading = useAuthStore((s) => s.isLoading);

  const [order, setOrder] = useState(null);
  // nolink: se abrió /checkout/confirmacion sin número o sin token (p. ej. desde el historial): no es un enlace inválido.
  const [state, setState] = useState(orderNumber && token ? 'loading' : 'nolink'); // loading | ready | notfound | error | nolink
  const [polls, setPolls] = useState(0);
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);

  // keepOnError: una relectura tras una acción no debe tapar el pedido (ni el aviso de la acción) si falla la red.
  const fetchOrder = useCallback(async ({ keepOnError = false } = {}) => {
    if (!orderNumber || !token) { setState('nolink'); return null; }
    try {
      const data = await orderService.getPublicOrder(orderNumber, token);
      if (!data) { setState('notfound'); return null; }
      setOrder(data); setState('ready');
      return data;
    } catch {
      if (!keepOnError) setState('error');
      return null;
    }
  }, [orderNumber, token]);

  useEffect(() => { if (orderNumber && token) setState('loading'); fetchOrder(); }, [fetchOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  // Consulta periódica mientras el pago está pendiente (el webhook actualiza la BD)
  useEffect(() => {
    if (order?.status !== 'payment_pending' || polls >= POLL_MAX) return undefined;
    const t = setTimeout(async () => { await fetchOrder({ keepOnError: true }); setPolls((n) => n + 1); }, POLL_MS);
    return () => clearTimeout(t);
  }, [order?.status, polls, fetchOrder]);

  // Vaciar el carrito solo cuando la BD confirma el pago del pedido de este checkout
  const local = orders.find((o) => o.order_number === orderNumber);
  // Pedido sobre el que se puede actuar: el de este navegador o, si no, el que identifica el enlace (id + token).
  const payable = local ?? (order?.id && token
    ? { id: order.id, order_number: order.order_number, public_token: token, total: order.total, status: order.status, created_at: order.created_at }
    : null);
  useEffect(() => {
    if (order?.status === 'paid' && local) {
      if (finalizePaidOrder(local.id)) analyticsService.purchase({ ...order, id: order.order_number });
    }
  }, [order?.status, local, finalizePaidOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  const retryPayment = async () => {
    if (!payable) { setActionError('Para reintentar el pago desde otro dispositivo, inicia sesión y abre el pedido en tu cuenta.'); return; }
    setBusy(true); setActionError(null);
    try {
      if (!local) rememberOrder(payable); // queda en «Pedidos hechos en este navegador»
      await wompiService.openWompiWidget({ order: payable, customer: { email: order.customer_email, name: order.customer_name, phone: '' } });
    } catch (e) {
      setActionError(e.message);
      // La BD decidió que el pedido ya no admite pago (vencido, pagado o cancelado en otra pestaña): mostrar su estado real.
      if (STALE_PAYMENT_CODES.has(e.code)) await fetchOrder({ keepOnError: true });
    } finally { setBusy(false); }
  };

  const cancelOrder = async () => {
    if (!payable) return;
    if (!window.confirm('¿Cancelar este pedido? Se liberarán los productos reservados.')) return;
    setBusy(true); setActionError(null);
    try { await orderService.cancelOrder(payable.id, payable.public_token, 'Cancelado por el cliente desde la confirmación'); await fetchOrder(); }
    catch (e) { setActionError(e.message); await fetchOrder({ keepOnError: true }); }
    finally { setBusy(false); }
  };

  if (state === 'loading') {
    return <div className="jm-container" style={{ padding: '5rem 0', textAlign: 'center' }} role="status">Consultando tu pedido…</div>;
  }
  if (state !== 'ready') {
    const noLink = state === 'nolink';
    const title = state === 'error' ? 'No pudimos consultar el pedido'
      : noLink ? (orders.length > 0 ? 'Pedidos hechos en este navegador' : 'No hay un pedido para mostrar')
        : 'Pedido no encontrado';
    const message = state === 'error' ? 'Revisa tu conexión e inténtalo de nuevo.'
      : noLink ? (orders.length > 0
        ? 'Elige un pedido para ver su estado, pagarlo o cancelarlo.'
        : 'Abre el enlace de tu pedido o, si compraste con tu cuenta, encuéntralo en «Mis pedidos».')
        : 'El enlace no es válido. Si tienes cuenta, encuentra tus pedidos en "Mi cuenta".';
    return (
      <div className="jm-container" style={{ padding: '4rem 0', maxWidth: '720px' }} data-testid="order-confirmation-fallback" data-state={state}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '1rem' }}>{title}</h1>
        <p style={{ color: '#71717A', marginBottom: '1.5rem' }}>{message}</p>
        {orders.length > 0 && (
          <section aria-labelledby={noLink ? undefined : 'browser-orders-title'} aria-label={noLink ? title : undefined} data-testid="browser-orders">
            {!noLink && <h2 id="browser-orders-title" style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.5rem' }}>Pedidos hechos en este navegador</h2>}
            <ul>
              {orders.map((o) => (
                <li key={o.id} style={{ marginBottom: '0.4rem' }}>
                  <Link to={`/checkout/confirmacion?order=${encodeURIComponent(o.order_number)}&token=${encodeURIComponent(o.public_token)}`} style={{ textDecoration: 'underline', fontWeight: 700, display: 'inline-flex', alignItems: 'center', minHeight: '32px' }}>
                    {o.order_number}
                  </Link>{' '}· {formatCOP(o.total)}
                </li>
              ))}
            </ul>
          </section>
        )}
        <Link to="/cuenta/pedidos" style={{ textDecoration: 'underline', fontWeight: 700, display: 'inline-flex', alignItems: 'center', minHeight: '36px' }}>Ir a mis pedidos</Link>
      </div>
    );
  }

  const st = order.status;
  const isPaidFlow = ['paid', 'processing', 'shipped', 'delivered'].includes(st);
  const isPending = st === 'payment_pending';
  const isClosed = ['cancelled', 'expired', 'refunded'].includes(st);
  const isRefunded = st === 'refunded';
  const refundMessage = orderRefundMessage(order, formatCOP);
  const paidCancelMessage = orderPaidCancellationMessage(order, formatCOP);
  const expiresAt = order.payment_expires_at ? new Date(order.payment_expires_at) : null;
  // La ventana de pago terminó aunque el job de expiración aún no haya cambiado el estado: no ofrecer «Pagar ahora».
  const windowClosed = isPending && expiresAt !== null && expiresAt.getTime() <= Date.now();
  const reached = new Set((order.timeline ?? []).map((t) => t.to_status));
  const methodLabel = shippingMethodLabel(order.shipping?.method, shippingMethods);
  const reviewMessage = orderReviewMessage(order, order.customer_email);

  return (
    <div style={{ backgroundColor: '#FFFFFF', padding: '3rem 0 5rem 0', minHeight: '85vh' }}>
      <div className="jm-container" style={{ maxWidth: '820px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }} role="status" aria-live="polite">
          {isPaidFlow && <CheckCircle2 size={60} color="#10B981" style={{ margin: '0 auto 1rem auto' }} />}
          {isPending && <Clock size={60} color="#D97706" style={{ margin: '0 auto 1rem auto' }} />}
          {isRefunded && <RotateCcw size={60} color="#52525B" style={{ margin: '0 auto 1rem auto' }} />}
          {isClosed && !isRefunded && <XCircle size={60} color="#E11D48" style={{ margin: '0 auto 1rem auto' }} />}
          <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase',
            color: isPaidFlow ? '#10B981' : isPending ? '#D97706' : isRefunded ? '#52525B' : '#E11D48' }}>
            {order.status_label || (isRefunded ? 'Reembolsado' : '')}
          </span>
          <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', margin: '0.4rem 0' }}>
            {isPaidFlow ? '¡Gracias por tu compra!' : isPending ? 'Pedido registrado' : isRefunded ? 'Pedido reembolsado' : paidCancelMessage ? 'Pedido cancelado' : 'Pedido cerrado'} · {order.order_number}
          </h1>
          <p style={{ fontSize: '0.95rem', color: '#71717A' }}>
            {isPaidFlow && !reviewMessage && `Confirmamos el pago. Te avisaremos a ${order.customer_email} cuando despachemos tu pedido.`}
            {windowClosed && 'El tiempo para pagar este pedido terminó. La reserva se liberará en unos minutos; puedes hacer un pedido nuevo.'}
            {isPending && !windowClosed && (payError
              ? 'Tu pedido quedó registrado y los productos están reservados, pero no se pudo abrir el pago. Puedes reintentarlo.'
              : polls >= POLL_MAX
                ? 'Aún no recibimos la confirmación del pago. Si ya pagaste, la confirmación puede tardar unos minutos: recarga esta página.'
                : 'Esperando la confirmación del pago de Wompi… esta página se actualiza sola.')}
            {st === 'expired' && 'El tiempo para pagar este pedido terminó y la reserva se liberó.'}
            {st === 'cancelled' && !paidCancelMessage && 'Este pedido fue cancelado.'}
            {paidCancelMessage && <span data-testid="order-refund-notice">{paidCancelMessage}</span>}
            {isRefunded && <span data-testid="order-refund-notice">{refundMessage}</span>}
          </p>
          {reviewMessage && (
            <p data-testid="order-review-notice" style={{ fontSize: '0.92rem', color: '#92400E', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A',
              borderRadius: '8px', padding: '0.8rem 1rem', margin: '1rem auto 0 auto', maxWidth: '620px', textAlign: 'left' }}>
              <strong>Pedido en revisión.</strong> {reviewMessage}
            </p>
          )}
          {isPending && !windowClosed && expiresAt && <p style={{ fontSize: '0.82rem', color: '#71717A' }}>Reserva válida hasta {expiresAt.toLocaleString('es-CO')}.</p>}
        </div>

        {actionError && <div role="alert" style={{ backgroundColor: '#FEF2F2', color: '#B91C1C', padding: '0.8rem 1rem', borderRadius: '8px', marginBottom: '1.5rem', fontWeight: 600 }}>{actionError}</div>}

        {isPending && (
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginBottom: '2rem', flexWrap: 'wrap' }}>
            {!windowClosed && (
            <button onClick={retryPayment} disabled={busy} style={{ backgroundColor: '#09090B', color: '#FFF', padding: '0.85rem 1.4rem', borderRadius: '6px', fontWeight: 800 }}>
              {busy ? 'Procesando…' : 'Pagar ahora'}
            </button>
            )}
            {payable && (
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
                <li key={s.key} style={{ flex: 1, textAlign: 'center', color: done ? '#09090B' : '#71717A', fontSize: '0.75rem', fontWeight: 700 }}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Envío{methodLabel ? ` (${methodLabel})` : ''}</span><span>{Number(order.shipping_cost) === 0 ? 'GRATIS' : formatCOP(order.shipping_cost)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '1.1rem' }}><span>Total</span><span>{formatCOP(order.total)}</span></div>
          </div>
        </section>

        <section style={{ border: '1px solid #E4E4E7', borderRadius: '10px', padding: '1.5rem', marginBottom: '2rem', fontSize: '0.9rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.75rem', textTransform: 'uppercase' }}>Envío</h2>
          <div>{order.customer_name}</div>
          <div>{order.shipping?.address}{order.shipping?.neighborhood ? `, ${order.shipping.neighborhood}` : ''}</div>
          <div>{order.shipping?.city}, {order.shipping?.department}</div>
          {methodLabel && <div data-testid="order-shipping-method" style={{ marginTop: '0.5rem', color: '#52525B' }}>Método: <strong>{methodLabel}</strong></div>}
        </section>

        {isPending && !payable && (
          <p style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: '#71717A', fontSize: '0.85rem' }}>
            <AlertTriangle size={16} /> Este pedido se creó en otro navegador: para pagarlo o cancelarlo, ábrelo desde ese navegador o desde tu cuenta.
          </p>
        )}
        {!userId && !authLoading && <GuestOrderLink orderNumber={order.order_number} token={token} />}

        <div style={{ textAlign: 'center' }}>
          <Link to="/ropa" style={{ textDecoration: 'underline', fontWeight: 700, display: 'inline-flex', alignItems: 'center', minHeight: '36px' }}>Seguir comprando</Link>
        </div>
      </div>
    </div>
  );
};

export default OrderConfirmationPage;
