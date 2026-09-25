import React, { useState } from 'react';
import { Tag, Plus, Check, X, Calendar, Percent, DollarSign, Truck } from 'lucide-react';
import { formatCOP } from '../../data/mockData';

export const AdminDiscountsPage = () => {
  const [coupons, setCoupons] = useState([
    { id: 'c-1', code: 'JM10OFF', type: 'percentage', value: 10, minPurchase: 100000, maxUses: 500, currentUses: 142, status: 'activo', expiresAt: '2026-12-31' },
    { id: 'c-2', code: 'BIENVENIDO2026', type: 'percentage', value: 15, minPurchase: 150000, maxUses: 1000, currentUses: 328, status: 'activo', expiresAt: '2026-12-31' },
    { id: 'c-3', code: 'ENVIOGRATIS', type: 'free_shipping', value: 0, minPurchase: 180000, maxUses: 200, currentUses: 89, status: 'activo', expiresAt: '2026-10-15' }
  ]);

  const [showModal, setShowModal] = useState(false);
  const [newCoupon, setNewCoupon] = useState({
    code: '',
    type: 'percentage',
    value: 10,
    minPurchase: 120000,
    maxUses: 100,
    expiresAt: '2026-12-31'
  });

  const handleCreateCoupon = (e) => {
    e.preventDefault();
    if (newCoupon.code) {
      setCoupons([...coupons, { id: `c-${Date.now()}`, ...newCoupon, currentUses: 0, status: 'activo' }]);
      setShowModal(false);
      setNewCoupon({ code: '', type: 'percentage', value: 10, minPurchase: 120000, maxUses: 100, expiresAt: '2026-12-31' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>
            GESTOR DE CUPONES Y DESCUENTOS ({coupons.length})
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#71717A' }}>
            Crea promociones por porcentaje, monto fijo o incentivos de envío gratis.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          style={{
            backgroundColor: '#09090B',
            color: '#FFFFFF',
            padding: '0.85rem 1.4rem',
            borderRadius: '6px',
            fontWeight: 800,
            fontSize: '0.85rem',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            cursor: 'pointer'
          }}
        >
          <Plus size={18} /> CREAR NUEVO CUPÓN
        </button>
      </div>

      {/* COUPONS TABLE */}
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E4E4E7', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#FAFAFA', borderBottom: '1px solid #E4E4E7', textAlign: 'left' }}>
              <th style={thDisc}>CÓDIGO DE CUPÓN</th>
              <th style={thDisc}>TIPO DE DESCUENTO</th>
              <th style={thDisc}>BENEFICIO</th>
              <th style={thDisc}>COMPRA MÍNIMA</th>
              <th style={thDisc}>USOS ACTUALES</th>
              <th style={thDisc}>VIGENCIA</th>
              <th style={thDisc}>ESTADO</th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid #F4F4F5' }}>
                <td style={{ ...tdDisc, fontWeight: 900 }}>
                  <span style={{ backgroundColor: '#FAFAFA', border: '1px solid #D4D4D8', padding: '4px 8px', borderRadius: '4px', letterSpacing: '0.08em' }}>
                    {c.code}
                  </span>
                </td>

                <td style={tdDisc}>
                  {c.type === 'percentage' && 'Porcentaje (%)'}
                  {c.type === 'fixed' && 'Valor Fijo ($ COP)'}
                  {c.type === 'free_shipping' && 'Envío Gratis'}
                </td>

                <td style={{ ...tdDisc, fontWeight: 900, color: '#09090B' }}>
                  {c.type === 'percentage' && `${c.value}% OFF`}
                  {c.type === 'fixed' && `${formatCOP(c.value)} OFF`}
                  {c.type === 'free_shipping' && 'Envío $0 COP'}
                </td>

                <td style={tdDisc}>{formatCOP(c.minPurchase)}</td>
                <td style={{ ...tdDisc, fontWeight: 700 }}>{c.currentUses} / {c.maxUses} usos</td>
                <td style={{ ...tdDisc, color: '#71717A' }}>{c.expiresAt}</td>

                <td style={tdDisc}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '3px 8px', borderRadius: '4px', backgroundColor: '#D1FAE5', color: '#065F46' }}>
                    ACTIVO
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* CREATE COUPON MODAL */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#FFFFFF',
              width: '100%',
              maxWidth: '520px',
              borderRadius: '12px',
              padding: '2rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 900, textTransform: 'uppercase' }}>NUEVO CUPÓN PROMOCIONAL</h2>
              <button onClick={() => setShowModal(false)} style={{ padding: '0.4rem' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleCreateCoupon} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Código del Cupón (Ej. BLACK2026) *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. BLACK2026"
                  value={newCoupon.code}
                  onChange={(e) => setNewCoupon({ ...newCoupon, code: e.target.value.toUpperCase() })}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Tipo de Descuento</label>
                  <select
                    value={newCoupon.type}
                    onChange={(e) => setNewCoupon({ ...newCoupon, type: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="percentage">Porcentaje (%)</option>
                    <option value="fixed">Monto Fijo ($ COP)</option>
                    <option value="free_shipping">Envío Gratis</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Valor del Descuento</label>
                  <input
                    type="number"
                    value={newCoupon.value}
                    onChange={(e) => setNewCoupon({ ...newCoupon, value: Number(e.target.value) })}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Compra Mínima ($ COP)</label>
                  <input
                    type="number"
                    value={newCoupon.minPurchase}
                    onChange={(e) => setNewCoupon({ ...newCoupon, minPurchase: Number(e.target.value) })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Límite de Usos</label>
                  <input
                    type="number"
                    value={newCoupon.maxUses}
                    onChange={(e) => setNewCoupon({ ...newCoupon, maxUses: Number(e.target.value) })}
                    style={inputStyle}
                  />
                </div>
              </div>

              <button
                type="submit"
                style={{
                  backgroundColor: '#09090B',
                  color: '#FFFFFF',
                  padding: '0.9rem',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  marginTop: '0.5rem'
                }}
              >
                CREAR CUPÓN
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const thDisc = {
  padding: '0.85rem 1rem',
  fontSize: '0.75rem',
  fontWeight: 800,
  color: '#71717A',
  letterSpacing: '0.05em'
};

const tdDisc = {
  padding: '0.85rem 1rem',
  color: '#09090B'
};

const labelStyle = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 700,
  color: '#09090B',
  marginBottom: '0.4rem'
};

const inputStyle = {
  width: '100%',
  padding: '0.7rem 0.85rem',
  border: '1px solid #D4D4D8',
  borderRadius: '6px',
  fontSize: '0.85rem',
  outline: 'none'
};

export default AdminDiscountsPage;
