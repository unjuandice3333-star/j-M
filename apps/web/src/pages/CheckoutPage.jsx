import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, Truck, CreditCard, ShieldCheck, CheckCircle2, ChevronRight, Check } from 'lucide-react';
import { useECommerceStore } from '../store/eCommerceStore';
import { formatCOP } from '../data/mockData';
import { analyticsService } from '../services/analytics';
import { wompiService } from '../services/wompi';
import { newIdempotencyKey } from '../services/orderService';
import { useAuthStore } from '../store/authStore';
import supabase from '../config/supabase';

// Departamentos de Colombia (y Bogotá D.C.). Se guarda el nombre tal cual en el pedido.
const DEPARTMENTS = [
  'Amazonas', 'Antioquia', 'Arauca', 'Atlántico', 'Bogotá D.C.', 'Bolívar', 'Boyacá', 'Caldas', 'Caquetá', 'Casanare',
  'Cauca', 'Cesar', 'Chocó', 'Córdoba', 'Cundinamarca', 'Guainía', 'Guaviare', 'Huila', 'La Guajira', 'Magdalena',
  'Meta', 'Nariño', 'Norte de Santander', 'Putumayo', 'Quindío', 'Risaralda', 'San Andrés y Providencia', 'Santander',
  'Sucre', 'Tolima', 'Valle del Cauca', 'Vaupés', 'Vichada'
];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// M28: borrador del envío en sessionStorage (se borra al cerrar la pestaña y al crear el pedido) para no perder lo
// escrito si hay que volver a iniciar sesión a mitad del checkout.
const DRAFT_KEY = 'jm-checkout-draft';
const DRAFT_FIELDS = ['phone', 'department', 'city', 'address', 'neighborhood', 'notes'];
const readDraft = () => { try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}'); } catch { return {}; } };
const writeDraft = (f) => { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(Object.fromEntries(DRAFT_FIELDS.map((k) => [k, f[k]])))); } catch { /* sin almacenamiento */ } };
const clearDraft = () => { try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* sin almacenamiento */ } };

/** Validación en el navegador (la BD vuelve a validar todo en create_order). */
function validate(f) {
  const e = {};
  if (f.firstName.trim().length < 2) e.firstName = 'Escribe tu nombre.';
  if (f.lastName.trim().length < 2) e.lastName = 'Escribe tu apellido.';
  if (!EMAIL_RE.test(f.email.trim())) e.email = 'Escribe un correo válido.';
  const digits = f.phone.replace(/[^0-9]/g, '');
  if (digits.length < 7 || digits.length > 15) e.phone = 'Escribe un teléfono de 7 a 15 dígitos.';
  if (!f.department) e.department = 'Elige el departamento.';
  if (f.city.trim().length < 2) e.city = 'Escribe la ciudad o municipio.';
  if (f.address.trim().length < 4) e.address = 'Escribe la dirección completa.';
  return e;
}

export const CheckoutPage = () => {
  const navigate = useNavigate();
  const { items, getTotals, createOrder, refreshQuote, appliedCoupon, shippingMethods, loadProducts } = useECommerceStore();
  const { user, profile } = useAuthStore();
  const totals = getTotals();

  // Clave de idempotencia por contenido del carrito: un doble clic o un reintento del mismo carrito devuelve el MISMO
  // pedido (create_order es idempotente); si el carrito cambia, es un pedido nuevo.
  const cartKey = items.map((i) => `${i.variantId}x${i.quantity}`).sort().join(',') + `|${appliedCoupon?.code ?? ''}`;
  const [idem, setIdem] = useState(() => ({ cartKey, key: newIdempotencyKey() }));
  const idempotencyKey = idem.cartKey === cartKey ? idem.key : null;
  useEffect(() => { if (idem.cartKey !== cartKey) setIdem({ cartKey, key: newIdempotencyKey() }); }, [cartKey, idem.cartKey]);

  useEffect(() => { loadProducts(); }, [loadProducts]);
  useEffect(() => {
    if (items.length > 0) analyticsService.beginCheckout(items, totals.total);
  }, [items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const fullName = (profile?.full_name || user?.user_metadata?.full_name || '').trim();
  const [formData, setFormData] = useState(() => {
    const draft = readDraft();
    return {
      firstName: fullName.split(' ')[0] || '',
      lastName: fullName.split(' ').slice(1).join(' ') || '',
      email: user?.email || '',
      phone: draft.phone || profile?.phone || '',
      department: draft.department || '',
      city: draft.city || '',
      address: draft.address || '',
      neighborhood: draft.neighborhood || '',
      notes: draft.notes || '',
    };
  });
  useEffect(() => { writeDraft(formData); }, [formData]);

  // M28: si el cliente empezó el checkout con sesión y la sesión vence (o se cierra desde otro dispositivo), NO se crea
  // un pedido como invitado sin avisar: quedaría fuera de «Mis pedidos». Se le pide volver a entrar o elegir invitado.
  const startedLoggedIn = useRef(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [guestAllowed, setGuestAllowed] = useState(false);
  useEffect(() => { if (user) { startedLoggedIn.current = true; setSessionExpired(false); } }, [user]);
  // La sesión se restaura de forma asíncrona: completar los campos vacíos cuando llegan el usuario y su perfil.
  useEffect(() => {
    if (!user) return;
    const name = (profile?.full_name || user.user_metadata?.full_name || '').trim();
    setFormData((prev) => ({
      ...prev,
      firstName: prev.firstName || name.split(' ')[0] || '',
      lastName: prev.lastName || name.split(' ').slice(1).join(' ') || '',
      email: prev.email || user.email || '',
      phone: prev.phone || profile?.phone || '',
    }));
  }, [user, profile]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [shippingMethod, setShippingMethod] = useState('standard');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Cotización autoritativa (incluye límites de cupón por correo)
  useEffect(() => {
    if (!items.length) return;
    const email = EMAIL_RE.test(formData.email.trim()) ? formData.email.trim().toLowerCase() : null;
    refreshQuote({ shippingMethod, email }).catch((e) => setErrorMessage(e.message));
  }, [cartKey, shippingMethod, formData.email, refreshQuote]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (isProcessing || !idempotencyKey) return;
    const errs = validate(formData);
    setFieldErrors(errs);
    if (Object.keys(errs).length) { setErrorMessage('Revisa los campos marcados.'); return; }
    if (totals.canCheckout === false) { setErrorMessage('Hay productos sin stock suficiente. Ajusta tu carrito.'); return; }

    setIsProcessing(true);
    setErrorMessage(null);
    if (startedLoggedIn.current && !guestAllowed) {
      // getSession renueva el token si venció; si el refresh token ya no es válido devuelve null.
      const { data } = await supabase.auth.getSession();
      if (!data?.session) { setSessionExpired(true); setIsProcessing(false); return; }
    }
    const customer = { name: `${formData.firstName.trim()} ${formData.lastName.trim()}`, email: formData.email.trim().toLowerCase(), phone: formData.phone };
    try {
      const order = await createOrder({
        customer,
        shipping: { department: formData.department, city: formData.city.trim(), address: formData.address.trim(),
          neighborhood: formData.neighborhood.trim(), notes: formData.notes.trim() },
        shippingMethod,
        idempotencyKey,
      });
      clearDraft();
      try {
        await wompiService.openWompiWidget({ order, customer });
      } catch (payErr) {
        // El pedido existe y reservó stock; el pago puede reintentarse desde la confirmación.
        setErrorMessage(`${payErr.message}`);
        navigate(`/checkout/confirmacion?order=${encodeURIComponent(order.order_number)}&token=${encodeURIComponent(order.public_token)}&pago=error`);
      }
    } catch (err) {
      setErrorMessage(err.message || 'No pudimos crear tu pedido. Inténtalo de nuevo.');
    } finally {
      setIsProcessing(false);
    }
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2.5rem', borderBottom: '1px solid #E4E4E7', paddingBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

          {/* CHECKOUT STEP PROGRESS BAR */}
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', backgroundColor: '#FFFFFF', padding: '0.75rem 1.25rem', borderRadius: '8px', border: '1px solid #E4E4E7', fontSize: '0.82rem', fontWeight: 700 }}>
            <span style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Check size={14} /> 1. Carrito</span>
            <span style={{ color: '#A1A1AA' }}>→</span>
            <span style={{ color: '#09090B', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><strong>2. Datos & Envío</strong></span>
            <span style={{ color: '#A1A1AA' }}>→</span>
            <span style={{ color: '#71717A' }}>3. Pago Seguro Wompi</span>
          </div>
        </div>

        {sessionExpired && (
          <div role="alert" style={{ backgroundColor: '#FFFBEB', color: '#92400E', padding: '1rem 1.5rem', borderRadius: 8, marginBottom: '2rem', border: '1px solid #FCD34D', fontWeight: 600, display: 'grid', gap: '0.6rem' }}>
            <span>Tu sesión expiró. Inicia sesión de nuevo para que este pedido quede en tu cuenta. Tu carrito y los datos de envío se conservan.</span>
            <span style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <Link to="/cuenta" state={{ from: '/checkout' }} style={{ color: '#92400E', textDecoration: 'underline', fontWeight: 800 }}>Iniciar sesión</Link>
              <button type="button" onClick={() => { setGuestAllowed(true); setSessionExpired(false); }} style={{ color: '#92400E', textDecoration: 'underline', fontWeight: 700 }}>Continuar como invitado</button>
            </span>
          </div>
        )}
        {errorMessage && (
          <div role="alert" style={{
            backgroundColor: '#FEF2F2',
            color: '#991B1B',
            padding: '1rem 1.5rem',
            borderRadius: '8px',
            marginBottom: '2rem',
            border: '1px solid #FCA5A5',
            fontWeight: 600
          }}>
            {errorMessage}
          </div>
        )}

        <form onSubmit={handlePlaceOrder} noValidate style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: '3rem' }} className="checkout-page-layout">
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
                  <input type="text" name="firstName" required value={formData.firstName} onChange={handleInputChange} aria-invalid={Boolean(fieldErrors.firstName)} style={inputStyle} />
                  <FieldError msg={fieldErrors.firstName} />
                </div>
                <div>
                  <label style={labelStyle}>Apellido *</label>
                  <input type="text" name="lastName" required value={formData.lastName} onChange={handleInputChange} aria-invalid={Boolean(fieldErrors.lastName)} style={inputStyle} />
                  <FieldError msg={fieldErrors.lastName} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Correo Electrónico *</label>
                  <input type="email" name="email" required value={formData.email} onChange={handleInputChange} aria-invalid={Boolean(fieldErrors.email)} style={inputStyle} />
                  <FieldError msg={fieldErrors.email} />
                </div>
                <div>
                  <label style={labelStyle}>Teléfono Celular (WhatsApp) *</label>
                  <input type="tel" name="phone" required value={formData.phone} onChange={handleInputChange} aria-invalid={Boolean(fieldErrors.phone)} style={inputStyle} />
                  <FieldError msg={fieldErrors.phone} />
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
                  <select name="department" required value={formData.department} onChange={handleInputChange} aria-invalid={Boolean(fieldErrors.department)} style={inputStyle}>
                    <option value="">Selecciona…</option>
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                  <FieldError msg={fieldErrors.department} />
                </div>
                <div>
                  <label style={labelStyle}>Ciudad / Municipio *</label>
                  <input type="text" name="city" required value={formData.city} onChange={handleInputChange} aria-invalid={Boolean(fieldErrors.city)} style={inputStyle} />
                  <FieldError msg={fieldErrors.city} />
                </div>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Dirección Exacta (Calle, Carrera, Número, Apto/Torre) *</label>
                <input type="text" name="address" required placeholder="Ej: Calle 93B # 11A - 28, Apt 402" value={formData.address} onChange={handleInputChange} aria-invalid={Boolean(fieldErrors.address)} style={inputStyle} />
                  <FieldError msg={fieldErrors.address} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Barrio</label>
                  <input type="text" name="neighborhood" value={formData.neighborhood} onChange={handleInputChange} style={inputStyle} />
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
                {shippingMethods.length === 0 && <div style={{ fontSize: '0.85rem', color: '#71717A' }}>Cargando métodos de envío…</div>}
                {shippingMethods.map((m) => (
                  <label key={m.code} style={optionCardStyle(shippingMethod === m.code)}>
                    <input type="radio" name="shipping" checked={shippingMethod === m.code} onChange={() => setShippingMethod(m.code)} style={{ accentColor: '#09090B' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>{m.name}{m.eta_text ? ` (${m.eta_text})` : ''}</div>
                      {m.free_over_subtotal ? <div style={{ fontSize: '0.78rem', color: '#71717A' }}>Gratis en compras desde {formatCOP(m.free_over_subtotal)}</div> : null}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                      {shippingMethod === m.code && !totals.isEstimate
                        ? (totals.shippingCost === 0 ? <span style={{ color: '#10B981' }}>GRATIS</span> : formatCOP(totals.shippingCost))
                        : formatCOP(m.cost)}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* 4. MÉTODO DE PAGO */}
            <div style={{ backgroundColor: '#FFFFFF', padding: '2rem', borderRadius: '10px', border: '1px solid #E4E4E7' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#09090B', textTransform: 'uppercase', marginBottom: '1.25rem' }}>
                4. MÉTODO DE PAGO
              </h2>
              <div style={optionCardStyle(true)}>
                <CreditCard size={20} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Pago seguro con Wompi</div>
                  <div style={{ fontSize: '0.78rem', color: '#71717A' }}>Tarjeta de crédito o débito, PSE, Nequi o Bancolombia. Eliges el medio en la ventana de Wompi.</div>
                </div>
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
                      <div style={{ fontSize: '0.75rem', color: '#71717A' }}>Talla: {item.size} • {item.color} • Cant: {item.quantity}</div>
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
                  <span>{formatCOP(totals.rawSubtotal)}</span>
                </div>
                {totals.couponDiscount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10B981', fontWeight: 700 }}>
                    <span>Descuento ({appliedCoupon?.code})</span>
                    <span>-{formatCOP(totals.couponDiscount)}</span>
                  </div>
                )}
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
                disabled={isProcessing || !idempotencyKey || totals.canCheckout === false}
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
                  gap: '0.5rem',
                  opacity: isProcessing ? 0.7 : 1,
                  cursor: isProcessing ? 'not-allowed' : 'pointer'
                }}
              >
                {isProcessing ? 'CREANDO TU PEDIDO…' : 'CONFIRMAR Y PAGAR'} <ChevronRight size={18} />
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

const FieldError = ({ msg }) => (msg ? <div role="alert" style={{ color: '#E11D48', fontSize: '0.75rem', fontWeight: 700, marginTop: '0.25rem' }}>{msg}</div> : null);

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
