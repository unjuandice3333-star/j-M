import React, { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, MessageCircle, Printer, ArrowRight, ShieldCheck, Truck } from 'lucide-react';
import { useECommerceStore } from '../store/eCommerceStore';
import { formatCOP } from '../data/mockData';
import { analyticsService } from '../services/analytics';
import supabase from '../config/supabase';

export const OrderConfirmationPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { orders } = useECommerceStore();

  const [dbOrder, setDbOrder] = useState(null);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const orderId = searchParams.get('orderId') || null;
  const fallbackOrder = orders.find((o) => o.id === orderId || o.order_number === orderId) || null;

  useEffect(() => {
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
          .single();

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
          setDbOrder(fallbackOrder);
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

  useEffect(() => {
    if (activeOrder && !activeOrder._analyticsTracked) {
      analyticsService.purchase(activeOrder);
      activeOrder._analyticsTracked = true;
    }
  }, [activeOrder]);

  if (isLoading) {
    return (
      <div style={{ padding: '5rem 0', textAlign: 'center', color: '#71717A' }}>
        Cargando detalles de tu pedido desde PostgreSQL...
      </div>
    );
  }

  if (!activeOrder) {
    return (
      <div style={{ backgroundColor: '#FFFFFF', padding: '5rem 0', minHeight: '75vh', textAlign: 'center' }}>
        <div className="jm-container" style={{ maxWidth: '500px', margin: '0 auto' }}>
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

  const isPendingPayment = activeOrder.status === 'pending' || activeOrder.status === 'payment_pending';

  const whatsappMessage = `Hola J&M Fashion Store, acabo de realizar la compra #${activeOrder.id}. Quisiera confirmar los detalles de despacho en Colombia.`;
  const whatsappUrl = `https://wa.me/573000000000?text=${encodeURIComponent(whatsappMessage)}`;

  return (
    <div style={{ backgroundColor: '#FFFFFF', padding: '3rem 0 5rem 0', minHeight: '85vh' }}>
      <div className="jm-container" style={{ maxWidth: '820px' }}>
        {/* SUCCESS OR PENDING STATUS BANNER */}
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          {isPendingPayment ? (
            <Clock size={64} color="#D97706" style={{ margin: '0 auto 1rem auto' }} />
          ) : (
            <CheckCircle2 size={64} color="#10B981" style={{ margin: '0 auto 1rem auto' }} />
          )}
          
          <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.15em', color: isPendingPayment ? '#D97706' : '#10B981', textTransform: 'uppercase' }}>
            {isPendingPayment ? 'ESTAMOS ESPERANDO CONFIRMACIÓN DEL PAGO' : '¡COMPRA REALIZADA CON ÉXITO!'}
          </span>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', margin: '0.4rem 0 0.5rem 0' }}>
            {isPendingPayment ? 'PEDIDO REGISTRADO #' : '¡GRACIAS POR TU PEDIDO! #'}{activeOrder.id}
          </h1>
          <p style={{ fontSize: '0.95rem', color: '#71717A' }}>
            {isPendingPayment
              ? 'Tu pedido se encuentra en espera de confirmación de pago por Wompi.'
              : `Hemos enviado la confirmación y recibo detallado al correo ${activeOrder.email || 'tu correo registrado'}.`}
          </p>
        </div>

        {/* ORDER TIMELINE TRACKING (FROM ORDER_EVENTS) */}
        <div style={{ backgroundColor: '#FAFAFA', border: '1px solid #E4E4E7', padding: '2rem', borderRadius: '12px', marginBottom: '2.5rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '1.5rem', color: '#09090B' }}>
            SEGUIMIENTO EN TIEMPO REAL DEL PEDIDO (TIMELINE EN POSTGRESQL)
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem', textAlign: 'center', position: 'relative' }}>
            {[
              { statusKey: 'payment_pending', title: 'Pedido Recibido', active: true, done: true },
              { statusKey: 'paid', title: 'Pago Confirmado', active: activeOrder.status !== 'payment_pending', done: activeOrder.status !== 'payment_pending' },
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
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#71717A', display: 'block' }}>ESTADO DE PAGO DE LA ORDEN</span>
              <p style={{ fontWeight: 800, marginTop: '0.2rem', color: isPendingPayment ? '#D97706' : '#10B981' }}>{activeOrder.status}</p>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#09090B', marginTop: '0.4rem' }}>
                TOTAL: {formatCOP(activeOrder.total)}
              </div>
            </div>
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center' }}>
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
              gap: '0.5rem'
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
              gap: '0.5rem'
            }}
          >
            SEGUIR COMPRANDO <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderConfirmationPage;
