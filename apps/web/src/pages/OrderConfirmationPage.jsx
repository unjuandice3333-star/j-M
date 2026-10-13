import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  MessageCircle,
  Printer,
  ArrowRight,
  RotateCcw,
  ShieldAlert
} from 'lucide-react';
import { useECommerceStore } from '../store/eCommerceStore';
import { formatCOP } from '../data/mockData';
import { analyticsService } from '../services/analytics';
import supabase from '../config/supabase';

export const OrderConfirmationPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { orders, clearCart, finalizePaidOrder } = useECommerceStore();

  const [dbOrder, setDbOrder] = useState(null);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const hasClearedCartRef = useRef(false);
  const hasTrackedAnalyticsRef = useRef(false);

  const orderId = searchParams.get('orderId') || null;
  const fallbackOrder = orders.find((o) => o.id === orderId || o.order_number === orderId) || null;

  // 1. Cargar detalles del pedido desde PostgreSQL
  useEffect(() => {
    if (!orderId) {
      setIsLoading(false);
      return;
    }

    const fetchRealOrderDetails = async () => {
      setIsLoading(true);
      try {
        const { data: oData, error: oErr } = await supabase
          .from('online_orders')
          .select(`
            id,
            order_number,
            customer_name,
            customer_email,
            shipping_address,
            shipping_city,
            total,
            status,
            created_at,
            online_order_items (
              id, product_name, size, color, unit_price, quantity, total
            )
          `)
          .or(`id.eq.${orderId.includes('-') && orderId.length === 36 ? orderId : '00000000-0000-0000-0000-000000000000'},order_number.eq.${orderId}`)
          .maybeSingle();

        if (!oErr && oData) {
          const normOrder = {
            id: oData.order_number || oData.id,
            rawId: oData.id,
            email: oData.customer_email,
            customerName: oData.customer_name,
            shippingAddress: `${oData.shipping_address}, ${oData.shipping_city}`,
            paymentMethod: 'Wompi / Online',
            total: Number(oData.total),
            status: oData.status,
            items: (oData.online_order_items || []).map((i) => ({
              name: i.product_name,
              size: i.size,
              color: i.color,
              price: Number(i.unit_price),
              quantity: i.quantity,
              image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=300'
            }))
          };
          setDbOrder(normOrder);

          // Cargar timeline de eventos reales en order_events
          const { data: eData } = await supabase
            .from('order_events')
            .select('event_type, previous_status, new_status, created_at')
            .eq('order_id', oData.id)
            .order('created_at', { ascending: true });

          if (eData) {
            setTimelineEvents(eData);
          }
        } else {
          // Si no pudo leer directamente por RLS (usuario invitado o sin token), intentar RPC segura
          const { data: rpcData, error: rpcErr } = await supabase.rpc('get_order_status', {
            p_order_id: orderId.includes('-') && orderId.length === 36 ? orderId : null,
            p_order_number: orderId
          });

          const rpcRecord = Array.isArray(rpcData) ? rpcData[0] : rpcData;
          if (!rpcErr && rpcRecord) {
            setDbOrder({
              id: rpcRecord.order_number || rpcRecord.id,
              rawId: rpcRecord.id,
              email: rpcRecord.customer_email,
              customerName: rpcRecord.customer_name,
              shippingAddress: fallbackOrder?.shippingAddress || 'Dirección registrada',
              paymentMethod: 'Wompi / Online',
              total: Number(rpcRecord.total),
              status: rpcRecord.status,
              items: fallbackOrder?.items || []
            });
          } else {
            setDbOrder(fallbackOrder);
          }
        }
      } catch (e) {
        setDbOrder(fallbackOrder);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRealOrderDetails();
  }, [orderId]);

  const activeOrder = dbOrder || fallbackOrder;
  const orderStatus = activeOrder?.status || 'unknown';

  const isPaid = orderStatus === 'paid';
  const isContraentrega = Boolean((activeOrder?.paymentMethod || '').toLowerCase().includes('contraentrega'));
  const isPendingPayment = orderStatus === 'payment_pending' || orderStatus === 'pending';
  const isFailed = ['cancelled', 'declined', 'voided', 'error'].includes(orderStatus);

  // 2. POLLING CONTROLADO: Detectar cambio payment_pending → paid / cancelled / declined / voided
  // Si la orden es Contraentrega, no requiere polling contra Wompi.
  useEffect(() => {
    if (!orderId || !isPendingPayment || isContraentrega) return;

    let attempts = 0;
    const maxAttempts = 30; // 30 intentos * 3s = 90s máximo

    const intervalId = setInterval(async () => {
      attempts += 1;
      if (attempts > maxAttempts) {
        clearInterval(intervalId);
        return;
      }

      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('get_order_status', {
          p_order_id: orderId.includes('-') && orderId.length === 36 ? orderId : null,
          p_order_number: orderId
        });

        const rpcRecord = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        if (!rpcErr && rpcRecord && rpcRecord.status) {
          if (rpcRecord.status !== activeOrder?.status) {
            setDbOrder((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                status: rpcRecord.status
              };
            });

            // Si llegó a estado terminal, detener polling
            if (['paid', 'cancelled', 'declined', 'voided'].includes(rpcRecord.status)) {
              clearInterval(intervalId);
            }
          }
        }
      } catch (err) {
        console.warn('[Polling Wompi Status Error]:', err);
      }
    }, 3000);

    return () => clearInterval(intervalId);
  }, [orderId, isPendingPayment, isContraentrega, activeOrder?.status]);

  // 3. VACIAR CARRITO Y REGISTRAR ANALYTICS ÚNICAMENTE CUANDO EL ESTADO SEA 'paid' O CONTRAENTREGA CONFIRMADO
  // Invariante de seguridad: Solo vacía el carrito si la orden corresponde a la sesión activa actual (finalizePaidOrder)
  useEffect(() => {
    if (activeOrder && (isPaid || isContraentrega)) {
      if (!hasClearedCartRef.current) {
        hasClearedCartRef.current = true;
        if (typeof finalizePaidOrder === 'function') {
          finalizePaidOrder(activeOrder.rawId || activeOrder.id);
        } else {
          clearCart();
        }
      }

      // Prevenir duplicación en analytics ante recargas (F5) o visitas posteriores
      if (!hasTrackedAnalyticsRef.current) {
        hasTrackedAnalyticsRef.current = true;
        const trackedKey = `jm_purchase_tracked_${activeOrder.rawId || activeOrder.id}`;
        try {
          if (!sessionStorage.getItem(trackedKey)) {
            sessionStorage.setItem(trackedKey, '1');
            analyticsService.purchase(activeOrder);
          }
        } catch (e) {
          analyticsService.purchase(activeOrder);
        }
      }
    }
  }, [activeOrder, isPaid, isContraentrega, finalizePaidOrder, clearCart]);

  if (isLoading) {
    return (
      <div style={{ padding: '5rem 0', textAlign: 'center', color: '#71717A' }}>
        Verificando estado del pedido en PostgreSQL...
      </div>
    );
  }

  if (!activeOrder) {
    return (
      <div style={{ backgroundColor: '#FFFFFF', padding: '5rem 0', minHeight: '75vh', textAlign: 'center' }}>
        <div className="jm-container" style={{ maxWidth: '500px', margin: '0 auto' }}>
          <ShieldAlert size={56} color="#DC2626" style={{ margin: '0 auto 1.5rem auto' }} />
          <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', marginBottom: '0.8rem' }}>
            PEDIDO NO ENCONTRADO
          </h2>
          <p style={{ fontSize: '0.9rem', color: '#71717A', marginBottom: '2rem', lineHeight: 1.6 }}>
            No pudimos ubicar un pedido válido con el identificador proporcionado o no dispones de permisos para consultarlo.
          </p>
          <Link
            to="/ropa"
            style={{
              display: 'inline-block',
              backgroundColor: '#09090B',
              color: '#FFFFFF',
              padding: '0.85rem 1.8rem',
              borderRadius: '6px',
              fontWeight: 800,
              fontSize: '0.85rem',
              textTransform: 'uppercase',
              textDecoration: 'none'
            }}
          >
            VOLVER A LA TIENDA
          </Link>
        </div>
      </div>
    );
  }

  const whatsappMessage = `Hola J&M Fashion Store, acabo de consultar mi pedido #${activeOrder.id} con estado ${activeOrder.status}.`;
  const whatsappUrl = `https://wa.me/573000000000?text=${encodeURIComponent(whatsappMessage)}`;

  return (
    <div style={{ backgroundColor: '#FFFFFF', padding: '3rem 0 5rem 0', minHeight: '85vh' }}>
      <div className="jm-container" style={{ maxWidth: '820px' }}>
        {/* STATUS BANNER SEGÚN EL ESTADO AUTORITATIVO REAL */}
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          {isPaid && (
            <>
              <CheckCircle2 size={64} color="#10B981" style={{ margin: '0 auto 1rem auto' }} />
              <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.15em', color: '#10B981', textTransform: 'uppercase' }}>
                ¡COMPRA REALIZADA CON ÉXITO!
              </span>
              <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', margin: '0.4rem 0 0.5rem 0' }}>
                ¡GRACIAS POR TU PEDIDO! #{activeOrder.id}
              </h1>
              <p style={{ fontSize: '0.95rem', color: '#71717A' }}>
                {`Hemos enviado la confirmación y recibo detallado al correo ${activeOrder.email || 'tu correo registrado'}.`}
              </p>
            </>
          )}

          {isContraentrega && !isPaid && (
            <>
              <CheckCircle2 size={64} color="#10B981" style={{ margin: '0 auto 1rem auto' }} />
              <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.15em', color: '#10B981', textTransform: 'uppercase' }}>
                ¡PEDIDO CONTRAENTREGA CONFIRMADO!
              </span>
              <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', margin: '0.4rem 0 0.5rem 0' }}>
                ¡PEDIDO EN PREPARACIÓN! #{activeOrder.id}
              </h1>
              <p style={{ fontSize: '0.95rem', color: '#71717A' }}>
                {`Tu orden ha sido registrada con éxito para despacho. Pagas en efectivo o datáfono al recibir tu paquete en ${activeOrder.shippingAddress || 'tu dirección registrada'}.`}
              </p>
            </>
          )}

          {isPendingPayment && !isContraentrega && (
            <>
              <Clock size={64} color="#D97706" style={{ margin: '0 auto 1rem auto' }} />
              <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.15em', color: '#D97706', textTransform: 'uppercase' }}>
                ESTAMOS ESPERANDO CONFIRMACIÓN DEL PAGO
              </span>
              <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', margin: '0.4rem 0 0.5rem 0' }}>
                PEDIDO REGISTRADO #{activeOrder.id}
              </h1>
              <p style={{ fontSize: '0.95rem', color: '#71717A' }}>
                Tu pedido se encuentra en espera de confirmación de pago por Wompi. Verificando automáticamente...
              </p>
            </>
          )}

          {isFailed && (
            <>
              <XCircle size={64} color="#EF4444" style={{ margin: '0 auto 1rem auto' }} />
              <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.15em', color: '#EF4444', textTransform: 'uppercase' }}>
                {orderStatus === 'declined' ? 'PAGO RECHAZADO' : orderStatus === 'voided' ? 'TRANSACCIÓN ANULADA' : 'PAGO CANCELADO / NO APROBADO'}
              </span>
              <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', margin: '0.4rem 0 0.5rem 0' }}>
                PAGO NO COMPLETADO #{activeOrder.id}
              </h1>
              <div style={{
                backgroundColor: '#FEF2F2',
                border: '1px solid #FCA5A5',
                padding: '1.25rem',
                borderRadius: '8px',
                maxWidth: '650px',
                margin: '1rem auto 0 auto',
                color: '#991B1B',
                fontSize: '0.92rem',
                lineHeight: 1.5
              }}>
                <p style={{ fontWeight: 700, marginBottom: '0.35rem' }}>
                  El pago no fue aprobado por la pasarela de pagos o fue cancelado.
                </p>
                <p style={{ margin: 0, color: '#7F1D1D', fontSize: '0.86rem' }}>
                  Tus prendas continúan seguras en tu carrito de compras para que puedas reintentar el pago con otra tarjeta, Nequi o PSE.
                </p>
              </div>
            </>
          )}

          {!isPaid && !isPendingPayment && !isFailed && (
            <>
              <AlertCircle size={64} color="#6B7280" style={{ margin: '0 auto 1rem auto' }} />
              <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.15em', color: '#6B7280', textTransform: 'uppercase' }}>
                ESTADO DEL PEDIDO: {orderStatus.toUpperCase()}
              </span>
              <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', margin: '0.4rem 0 0.5rem 0' }}>
                PEDIDO #{activeOrder.id}
              </h1>
              <p style={{ fontSize: '0.95rem', color: '#71717A' }}>
                El estado de tu pedido es: <strong>{orderStatus}</strong>.
              </p>
            </>
          )}
        </div>

        {/* ORDER TIMELINE TRACKING (ONLY FOR PAID OR PENDING) */}
        {!isFailed && (
          <div style={{ backgroundColor: '#FAFAFA', border: '1px solid #E4E4E7', padding: '2rem', borderRadius: '12px', marginBottom: '2.5rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '1.5rem', color: '#09090B' }}>
              SEGUIMIENTO EN TIEMPO REAL DEL PEDIDO (TIMELINE EN POSTGRESQL)
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem', textAlign: 'center', position: 'relative' }}>
              {[
                { statusKey: 'payment_pending', title: 'Pedido Recibido', active: true, done: true },
                { statusKey: 'paid', title: 'Pago Confirmado', active: isPaid || ['preparing', 'shipped', 'delivered'].includes(activeOrder.status), done: isPaid || ['preparing', 'shipped', 'delivered'].includes(activeOrder.status) },
                { statusKey: 'preparing', title: 'En Preparación', active: ['preparing', 'shipped', 'delivered'].includes(activeOrder.status), done: ['shipped', 'delivered'].includes(activeOrder.status) },
                { statusKey: 'shipped', title: 'Enviado', active: ['shipped', 'delivered'].includes(activeOrder.status), done: activeOrder.status === 'delivered' },
                { statusKey: 'delivered', title: 'Entregado', active: activeOrder.status === 'delivered', done: activeOrder.status === 'delivered' }
              ].map((step, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: step.done ? '#10B981' : step.active ? '#09090B' : '#E4E4E7',
                    color: step.active || step.done ? '#FFFFFF' : '#71717A',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '0.8rem',
                    zIndex: 2
                  }}>
                    {step.done ? '✓' : idx + 1}
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: step.active ? 800 : 500, color: step.active ? '#09090B' : '#71717A' }}>
                    {step.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ORDER SUMMARY DETAILS */}
        <div style={{ border: '1px solid #E4E4E7', borderRadius: '12px', padding: '2rem', marginBottom: '2.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#09090B', textTransform: 'uppercase', marginBottom: '1.25rem', borderBottom: '1px solid #E4E4E7', paddingBottom: '0.75rem' }}>
            RESUMEN DE ARTÍCULOS
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
            {activeOrder.items?.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '1rem', alignItems: 'center', borderBottom: '1px solid #F4F4F5', paddingBottom: '1rem' }}>
                <img src={item.image} alt="" style={{ width: '55px', height: '70px', objectFit: 'cover', borderRadius: '6px' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#09090B' }}>{item.name}</div>
                  <div style={{ fontSize: '0.78rem', color: '#71717A' }}>Talla: {item.size} • Color: {item.color} • Cantidad: {item.quantity}</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#09090B' }}>
                  {formatCOP(item.price * item.quantity)}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', fontSize: '0.88rem', color: '#27272A', backgroundColor: '#FAFAFA', padding: '1.25rem', borderRadius: '8px' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#71717A', display: 'block' }}>DIRECCIÓN DE ENTREGA</span>
              <p style={{ fontWeight: 600, marginTop: '0.2rem' }}>{activeOrder.shippingAddress || 'Dirección registrada en Colombia'}</p>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#71717A', display: 'block' }}>ESTADO DE LA ORDEN</span>
              <p style={{
                fontWeight: 800,
                marginTop: '0.2rem',
                color: isPaid ? '#10B981' : isPendingPayment ? '#D97706' : isFailed ? '#EF4444' : '#71717A',
                textTransform: 'uppercase'
              }}>
                {orderStatus === 'paid' ? 'PAGADO / CONFIRMADO' : orderStatus === 'payment_pending' ? 'PAGO PENDIENTE' : orderStatus}
              </p>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#09090B', marginTop: '0.4rem' }}>
                TOTAL: {formatCOP(activeOrder.total)}
              </div>
            </div>
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center' }}>
          {isFailed ? (
            <>
              <button
                onClick={() => navigate('/checkout')}
                style={{
                  backgroundColor: '#09090B',
                  color: '#FFFFFF',
                  padding: '0.9rem 1.8rem',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  border: 'none'
                }}
              >
                <RotateCcw size={16} /> REINTENTAR PAGO
              </button>

              <button
                onClick={() => navigate('/ropa')}
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E4E4E7',
                  color: '#09090B',
                  padding: '0.9rem 1.6rem',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer'
                }}
              >
                VOLVER A LA TIENDA
              </button>

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  backgroundColor: '#25D366',
                  color: '#FFFFFF',
                  padding: '0.9rem 1.6rem',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  textDecoration: 'none'
                }}
              >
                <MessageCircle size={18} /> ASISTENCIA POR WHATSAPP
              </a>
            </>
          ) : (
            <>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  backgroundColor: '#25D366',
                  color: '#FFFFFF',
                  padding: '0.9rem 1.6rem',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  textDecoration: 'none'
                }}
              >
                <MessageCircle size={18} /> CONFIRMAR POR WHATSAPP
              </a>

              <button
                onClick={() => window.print()}
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E4E4E7',
                  color: '#09090B',
                  padding: '0.9rem 1.6rem',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer'
                }}
              >
                <Printer size={18} /> IMPRIMIR RECIBO
              </button>

              <button
                onClick={() => navigate('/ropa')}
                style={{
                  backgroundColor: '#09090B',
                  color: '#FFFFFF',
                  padding: '0.9rem 1.8rem',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  border: 'none'
                }}
              >
                SEGUIR COMPRANDO <ArrowRight size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderConfirmationPage;
