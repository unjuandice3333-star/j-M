import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, Truck, CreditCard, ShieldCheck, CheckCircle2, ChevronRight } from 'lucide-react';
import { useECommerceStore } from '../store/eCommerceStore';
import { formatCOP } from '../data/mockData';

const DEPARTMENTS = [
  'Cundinamarca (Bogotá D.C.)',
  'Antioquia (Medellín)',
  'Valle del Cauca (Cali)',
  'Atlántico (Barranquilla)',
  'Santander (Bucaramanga)',
  'Bolívar (Cartagena)',
  'Risaralda (Pereira)',
  'Caldas (Manizales)',
  'Meta (Villavicencio)',
  'Norte de Santander (Cúcuta)',
  'Quindío (Armenia)',
  'Tolima (Ibagué)',
  'Otro Departamento...'
];

export const CheckoutPage = () => {
  const navigate = useNavigate();
  const { items, userProfile, getTotals, createOrder } = useECommerceStore();
  const totals = getTotals();

  // Form States
  const [formData, setFormData] = useState({
    firstName: userProfile?.name?.split(' ')[0] || 'Alejandro',
    lastName: userProfile?.name?.split(' ')[1] || 'Morales',
    email: userProfile?.email || 'alejo.morales@gmail.com',
    phone: userProfile?.phone || '3104567890',
    department: 'Cundinamarca (Bogotá D.C.)',
    city: 'Bogotá D.C.',
    address: 'Calle 93B # 11A - 28, Apt 402',
    neighborhood: 'El Chicó',
    notes: 'Dejar con el vigilante en portería'
  });

  const [shippingMethod, setShippingMethod] = useState('estandar'); // 'estandar' | 'expreso'
  const [paymentMethod, setPaymentMethod] = useState('credit_card'); // 'credit_card' | 'pse' | 'nequi' | 'contraentrega'

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePlaceOrder = (e) => {
    e.preventDefault();

    const orderData = {
      customerName: `${formData.firstName} ${formData.lastName}`,
      email: formData.email,
      phone: formData.phone,
      shippingAddress: `${formData.address}, ${formData.neighborhood}, ${formData.city}, ${formData.department}`,
      shippingNotes: formData.notes,
      shippingMethod: shippingMethod === 'expreso' ? 'Envío Expreso 24h' : 'Envío Estándar Nacional',
      paymentMethod:
        paymentMethod === 'credit_card'
          ? 'Tarjeta de Crédito / Débito'
          : paymentMethod === 'pse'
          ? 'PSE Débito Bancario'
          : paymentMethod === 'nequi'
          ? 'Nequi / Bancolombia'
          : 'Pago Contraentrega en Efectivo',
      total: totals.total,
      items: items.map((i) => ({
        name: i.name,
        size: i.size,
        color: i.color,
        price: i.price,
        quantity: i.quantity,
        image: i.image
      }))
    };

    const orderId = createOrder(orderData);
    navigate(`/checkout/confirmacion?orderId=${orderId}`);
  };

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '5rem 1rem' }}>
        <h2>No tienes productos en el carrito para comprar</h2>
        <Link to="/ropa" style={{ color: '#09090B', fontWeight: 700, textDecoration: 'underline' }}>Volver a la tienda</Link>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#FAFAFA', padding: '2.5rem 0 5rem 0', minHeight: '90vh' }}>
      <div className="jm-container">
        {/* CHECKOUT HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', borderBottom: '1px solid #E4E4E7', paddingBottom: '1.25rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#71717A', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              PROCESO DE PAGO SEGURO
            </span>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', marginTop: '0.2rem' }}>
              CHECKOUT J&M FASHION STORE
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#10B981' }}>
            <Lock size={16} /> Encriptación SSL de 256 bits
          </div>
        </div>

        <form onSubmit={handlePlaceOrder} style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: '3rem' }} className="checkout-page-layout">
          {/* LEFT FORM COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* 1. INFORMACIÓN DE CONTACTO */}
            <div style={{ backgroundColor: '#FFFFFF', padding: '2rem', borderRadius: '10px', border: '1px solid #E4E4E7' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#09090B', textTransform: 'uppercase', marginBottom: '1.25rem' }}>
                1. DATOS DE CONTACTO & CLIENTE
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={labelStyle}>Nombre *</label>
                  <input type="text" name="firstName" required value={formData.firstName} onChange={handleInputChange} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Apellido *</label>
                  <input type="text" name="lastName" required value={formData.lastName} onChange={handleInputChange} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Correo Electrónico *</label>
                  <input type="email" name="email" required value={formData.email} onChange={handleInputChange} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Teléfono Celular (WhatsApp) *</label>
                  <input type="tel" name="phone" required value={formData.phone} onChange={handleInputChange} style={inputStyle} />
                </div>
              </div>
            </div>

            {/* 2. DIRECCIÓN DE ENVÍO EN COLOMBIA */}
            <div style={{ backgroundColor: '#FFFFFF', padding: '2rem', borderRadius: '10px', border: '1px solid #E4E4E7' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#09090B', textTransform: 'uppercase', marginBottom: '1.25rem' }}>
                2. DIRECCIÓN DE ENVÍO (COLOMBIA)
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={labelStyle}>Departamento *</label>
                  <select name="department" value={formData.department} onChange={handleInputChange} style={inputStyle}>
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Ciudad / Municipio *</label>
                  <input type="text" name="city" required value={formData.city} onChange={handleInputChange} style={inputStyle} />
                </div>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Dirección Exacta (Calle, Carrera, Número, Apto/Torre) *</label>
                <input type="text" name="address" required placeholder="Ej: Calle 93B # 11A - 28, Apt 402" value={formData.address} onChange={handleInputChange} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Barrio *</label>
                  <input type="text" name="neighborhood" required value={formData.neighborhood} onChange={handleInputChange} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Notas adicionales de entrega (Opcional)</label>
                  <input type="text" name="notes" placeholder="Ej: Dejar en portería" value={formData.notes} onChange={handleInputChange} style={inputStyle} />
                </div>
              </div>
            </div>

            {/* 3. MÉTODO DE ENVÍO */}
            <div style={{ backgroundColor: '#FFFFFF', padding: '2rem', borderRadius: '10px', border: '1px solid #E4E4E7' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#09090B', textTransform: 'uppercase', marginBottom: '1.25rem' }}>
                3. MÉTODO DE ENVÍO
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <label style={optionCardStyle(shippingMethod === 'estandar')}>
                  <input type="radio" name="shipping" checked={shippingMethod === 'estandar'} onChange={() => setShippingMethod('estandar')} style={{ accentColor: '#09090B' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Envío Estándar Nacional (2 a 4 días hábiles)</div>
                    <div style={{ fontSize: '0.78rem', color: '#71717A' }}>Entrega garantizada a todo Colombia por Coordinadora / Servientrega</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                    {totals.shippingCost === 0 ? <span style={{ color: '#10B981' }}>GRATIS</span> : formatCOP(15000)}
                  </div>
                </label>

                <label style={optionCardStyle(shippingMethod === 'expreso')}>
                  <input type="radio" name="shipping" checked={shippingMethod === 'expreso'} onChange={() => setShippingMethod('expreso')} style={{ accentColor: '#09090B' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Envío Expreso 24h (Solo Bogotá y Medellín)</div>
                    <div style={{ fontSize: '0.78rem', color: '#71717A' }}>Recibe tu pedido al día siguiente útil</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>{formatCOP(22000)}</div>
                </label>
              </div>
            </div>

            {/* 4. MÉTODO DE PAGO */}
            <div style={{ backgroundColor: '#FFFFFF', padding: '2rem', borderRadius: '10px', border: '1px solid #E4E4E7' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#09090B', textTransform: 'uppercase', marginBottom: '1.25rem' }}>
                4. MÉTODO DE PAGO
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <label style={optionCardStyle(paymentMethod === 'credit_card')}>
                  <input type="radio" name="payment" checked={paymentMethod === 'credit_card'} onChange={() => setPaymentMethod('credit_card')} style={{ accentColor: '#09090B' }} />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Tarjeta de Crédito / Débito</div>
                    <div style={{ fontSize: '0.78rem', color: '#71717A' }}>Visa, Mastercard, American Express</div>
                  </div>
                </label>

                <label style={optionCardStyle(paymentMethod === 'pse')}>
                  <input type="radio" name="payment" checked={paymentMethod === 'pse'} onChange={() => setPaymentMethod('pse')} style={{ accentColor: '#09090B' }} />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>PSE — Débito desde cualquier banco en Colombia</div>
                    <div style={{ fontSize: '0.78rem', color: '#71717A' }}>Bancolombia, Davivienda, BBVA, Banco de Bogotá, etc.</div>
                  </div>
                </label>

                <label style={optionCardStyle(paymentMethod === 'nequi')}>
                  <input type="radio" name="payment" checked={paymentMethod === 'nequi'} onChange={() => setPaymentMethod('nequi')} style={{ accentColor: '#09090B' }} />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Nequi / Bancolombia QR</div>
                    <div style={{ fontSize: '0.78rem', color: '#71717A' }}>Transferencia inmediata mediante código QR</div>
                  </div>
                </label>

                <label style={optionCardStyle(paymentMethod === 'contraentrega')}>
                  <input type="radio" name="payment" checked={paymentMethod === 'contraentrega'} onChange={() => setPaymentMethod('contraentrega')} style={{ accentColor: '#09090B' }} />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Pago Contraentrega (Bogotá y Medellín)</div>
                    <div style={{ fontSize: '0.78rem', color: '#71717A' }}>Pagas en efectivo o datáfono al recibir tu paquete</div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* RIGHT SUMMARY SIDEBAR */}
          <div>
            <div style={{
              backgroundColor: '#FFFFFF',
              padding: '2rem',
              borderRadius: '10px',
              border: '1px solid #E4E4E7',
              position: 'sticky',
              top: '100px'
            }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#09090B', textTransform: 'uppercase', marginBottom: '1.25rem', borderBottom: '1px solid #E4E4E7', paddingBottom: '0.75rem' }}>
                TU PEDIDO ({items.reduce((s, i) => s + i.quantity, 0)})
              </h2>

              {/* Items List Mini */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', maxHeight: '280px', overflowY: 'auto', marginBottom: '1.5rem' }}>
                {items.map((item) => (
                  <div key={item.id} style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                    <img src={item.image} alt={item.name} style={{ width: '48px', height: '60px', objectFit: 'cover', borderRadius: '4px' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#09090B' }}>{item.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#71717A' }}>Talla: {item.size} • Cant: {item.quantity}</div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#09090B' }}>
                      {formatCOP(item.price * item.quantity)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals Breakdown */}
              <div style={{ borderTop: '1px solid #E4E4E7', paddingTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.88rem', color: '#71717A', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal</span>
                  <span>{formatCOP(totals.subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Envío</span>
                  <span>{totals.shippingCost === 0 ? <strong style={{ color: '#10B981' }}>GRATIS</strong> : formatCOP(totals.shippingCost)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', fontWeight: 900, color: '#09090B', paddingTop: '0.5rem', borderTop: '1px solid #F4F4F5' }}>
                  <span>TOTAL A PAGAR</span>
                  <span>{formatCOP(totals.total)}</span>
                </div>
              </div>

              <button
                type="submit"
                style={{
                  width: '100%',
                  backgroundColor: '#09090B',
                  color: '#FFFFFF',
                  padding: '1.1rem',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.92rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                CONFIRMAR Y PAGAR <ChevronRight size={18} />
              </button>

              <div style={{ marginTop: '1.25rem', fontSize: '0.75rem', color: '#71717A', textAlign: 'center', lineHeight: 1.5 }}>
                Al hacer clic en "Confirmar y Pagar", aceptas nuestros términos y condiciones y políticas de privacidad en Colombia.
              </div>
            </div>
          </div>
        </form>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .checkout-page-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
};

const labelStyle = {
  display: 'block',
  fontSize: '0.82rem',
  fontWeight: 700,
  color: '#09090B',
  marginBottom: '0.4rem'
};

const inputStyle = {
  width: '100%',
  padding: '0.75rem 0.9rem',
  border: '1px solid #D4D4D8',
  borderRadius: '6px',
  fontSize: '0.88rem',
  outline: 'none'
};

const optionCardStyle = (isSelected) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '1rem',
  padding: '1rem',
  borderRadius: '8px',
  border: isSelected ? '2px solid #09090B' : '1px solid #E4E4E7',
  backgroundColor: isSelected ? '#FAFAFA' : '#FFFFFF',
  cursor: 'pointer'
});

export default CheckoutPage;
