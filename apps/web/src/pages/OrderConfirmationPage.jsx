import React from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Package, Truck, Clock, MessageCircle, Printer, ArrowRight } from 'lucide-react';
import { useECommerceStore } from '../store/eCommerceStore';
import { formatCOP } from '../data/mockData';

export const OrderConfirmationPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { orders } = useECommerceStore();

  const orderId = searchParams.get('orderId') || 'JM-1024';
  const order = orders.find((o) => o.id === orderId) || orders[0];

  const handlePrint = () => {
    window.print();
  };

  const whatsappMessage = `Hola J&M Fashion Store, acabo de realizar la compra #${order.id}. Quisiera confirmar los detalles de despacho a Colombia.`;
  const whatsappUrl = `https://wa.me/573000000000?text=${encodeURIComponent(whatsappMessage)}`;

  return (
    <div style={{ backgroundColor: '#FFFFFF', padding: '3rem 0 5rem 0', minHeight: '85vh' }}>
      <div className="jm-container" style={{ maxWidth: '820px' }}>
        {/* SUCCESS ICON & BANNER */}
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <CheckCircle2 size={64} color="#10B981" style={{ margin: '0 auto 1rem auto' }} />
          <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.15em', color: '#10B981', textTransform: 'uppercase' }}>
            ¡COMPRA REALIZADA CON ÉXITO!
          </span>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', margin: '0.4rem 0 0.5rem 0' }}>
            ¡GRACIAS POR TU PEDIDO! #{order.id}
          </h1>
          <p style={{ fontSize: '0.95rem', color: '#71717A' }}>
            Hemos enviado la confirmación y recibo detallado al correo <strong>{order.email || 'tu correo registrado'}</strong>.
          </p>
        </div>

        {/* ORDER TIMELINE TRACKING */}
        <div style={{ backgroundColor: '#FAFAFA', border: '1px solid #E4E4E7', padding: '2rem', borderRadius: '12px', marginBottom: '2.5rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '1.5rem', color: '#09090B' }}>
            SEGUIMIENTO EN TIEMPO REAL DEL PEDIDO
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem', textAlign: 'center', position: 'relative' }}>
            {[
              { title: 'Pedido Recibido', active: true, done: true },
              { title: 'Pago Confirmado', active: true, done: true },
              { title: 'En Preparación', active: true, done: false },
              { title: 'Enviado', active: false, done: false },
              { title: 'Entregado', active: false, done: false }
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
            {order.items?.map((item, idx) => (
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
              <p style={{ fontWeight: 600, marginTop: '0.2rem' }}>{order.shippingAddress || 'Dirección registrada en Colombia'}</p>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#71717A', display: 'block' }}>MÉTODO DE PAGO</span>
              <p style={{ fontWeight: 600, marginTop: '0.2rem' }}>{order.paymentMethod}</p>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#09090B', marginTop: '0.4rem' }}>
                TOTAL PAID: {formatCOP(order.total)}
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
            onClick={handlePrint}
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
