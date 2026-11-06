// =============================================================================
// Cupones — tabla public.coupons (RLS: solo admin). La validación y el canje los hace la BD (validate_coupon,
// quote_cart y create_order): tipo (percent | fixed | free_shipping), mínimo de compra, vigencia, usos totales y por
// correo. M27: reescrito; antes eran 3 cupones simulados en el estado de React que no existían en la BD.
// =============================================================================
import React, { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { formatCOP } from '../../data/mockData';
import supabase from '../../config/supabase';
import { adminError } from '../../services/adminService';

const TYPE_LABEL = { percent: 'Porcentaje', fixed: 'Valor fijo', free_shipping: 'Envío gratis' };
const empty = { id: null, code: '', description: '', discount_type: 'percent', discount_value: '10', min_subtotal: '0', max_uses: '', max_uses_per_email: '', starts_at: '', expires_at: '', is_active: true };
const toLocal = (ts) => (ts ? new Date(ts).toISOString().slice(0, 16) : '');

export function couponState(c, now = new Date()) {
  if (!c.is_active) return { label: 'Inactivo', color: '#52525B' };
  if (c.starts_at && new Date(c.starts_at) > now) return { label: 'Programado', color: '#1D4ED8' };
  if (c.expires_at && new Date(c.expires_at) <= now) return { label: 'Vencido', color: '#B91C1C' };
  if (c.max_uses && c.used_count >= c.max_uses) return { label: 'Agotado', color: '#B91C1C' };
  return { label: 'Activo', color: '#065F46' };
}

export const AdminDiscountsPage = () => {
  const [coupons, setCoupons] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
    if (error) setLoadError('No se pudieron cargar los cupones.'); else { setCoupons(data); setLoadError(null); }
  };
  useEffect(() => { load(); }, []);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const edit = (c) => { setFormError(null); setForm({ ...c, discount_value: String(c.discount_value), min_subtotal: String(c.min_subtotal),
    max_uses: c.max_uses ?? '', max_uses_per_email: c.max_uses_per_email ?? '', starts_at: toLocal(c.starts_at), expires_at: toLocal(c.expires_at), description: c.description ?? '' }); };

  const save = async (e) => {
    e.preventDefault();
    setFormError(null);
    const code = form.code.trim().toUpperCase();
    const value = Number(form.discount_value);
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) { setFormError('Código: 3 a 40 caracteres en MAYÚSCULAS, números, guion o guion bajo.'); return; }
    if (form.discount_type === 'percent' && !(Number.isInteger(value) && value >= 1 && value <= 100)) { setFormError('El porcentaje debe estar entre 1 y 100.'); return; }
    if (form.discount_type === 'fixed' && !(Number.isInteger(value) && value > 0)) { setFormError('El valor fijo debe ser mayor que 0.'); return; }
    if (form.starts_at && form.expires_at && new Date(form.expires_at) <= new Date(form.starts_at)) { setFormError('La fecha de fin debe ser posterior a la de inicio.'); return; }
    const row = {
      code, description: form.description.trim() || null, discount_type: form.discount_type,
      discount_value: form.discount_type === 'free_shipping' ? 0 : value, min_subtotal: Number(form.min_subtotal || 0),
      max_uses: form.max_uses === '' ? null : Number(form.max_uses), max_uses_per_email: form.max_uses_per_email === '' ? null : Number(form.max_uses_per_email),
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null, expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      is_active: form.is_active,
    };
    setSaving(true);
    const q = form.id ? supabase.from('coupons').update(row).eq('id', form.id) : supabase.from('coupons').insert(row);
    const { error } = await q;
    setSaving(false);
    if (error) { setFormError(adminError(error, 'No se pudo guardar el cupón.').message); return; }
    setNotice(`Cupón ${code} ${form.id ? 'actualizado' : 'creado'}.`);
    setForm(null); load();
  };

  const toggleActive = async (c) => {
    const { error } = await supabase.from('coupons').update({ is_active: !c.is_active }).eq('id', c.id);
    if (error) setNotice(adminError(error).message); else { setNotice(`Cupón ${c.code} ${c.is_active ? 'desactivado' : 'activado'}.`); load(); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>CUPONES ({coupons.length})</h1>
          <p style={{ fontSize: '0.88rem', color: '#71717A' }}>Los descuentos se validan y se cuentan en el servidor al crear cada pedido.</p>
        </div>
        <button onClick={() => { setFormError(null); setForm({ ...empty }); }} style={{ backgroundColor: '#09090B', color: '#FFFFFF', padding: '0.8rem 1.4rem', borderRadius: '6px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={18} /> CREAR CUPÓN
        </button>
      </div>
      {loadError && <div role="alert" style={{ color: '#B91C1C', fontWeight: 600 }}>{loadError}</div>}
      {notice && <div role="status" style={{ color: '#065F46', fontWeight: 600 }}>{notice}</div>}

      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E4E4E7', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#FAFAFA', borderBottom: '1px solid #E4E4E7', textAlign: 'left' }}>
              {['CÓDIGO', 'BENEFICIO', 'COMPRA MÍNIMA', 'USOS', 'VIGENCIA', 'ESTADO', ''].map((h) => <th key={h} style={thDisc}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {coupons.length === 0 && <tr><td colSpan={7} style={{ ...tdDisc, color: '#71717A' }}>No hay cupones.</td></tr>}
            {coupons.map((c) => {
              const stt = couponState(c);
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid #F4F4F5' }}>
                  <td style={{ ...tdDisc, fontWeight: 900 }}>{c.code}<div style={{ fontSize: '0.72rem', color: '#71717A', fontWeight: 500 }}>{c.description}</div></td>
                  <td style={tdDisc}>{c.discount_type === 'percent' ? `${c.discount_value}%` : c.discount_type === 'fixed' ? formatCOP(Number(c.discount_value)) : 'Envío gratis'}</td>
                  <td style={tdDisc}>{Number(c.min_subtotal) > 0 ? formatCOP(Number(c.min_subtotal)) : '—'}</td>
                  <td style={tdDisc}>{c.used_count}{c.max_uses ? ` / ${c.max_uses}` : ''}{c.max_uses_per_email ? ` (máx. ${c.max_uses_per_email} por correo)` : ''}</td>
                  <td style={{ ...tdDisc, color: '#71717A', fontSize: '0.78rem' }}>
                    {c.starts_at ? `desde ${new Date(c.starts_at).toLocaleDateString('es-CO')}` : 'sin inicio'} · {c.expires_at ? `hasta ${new Date(c.expires_at).toLocaleDateString('es-CO')}` : 'sin fin'}
                  </td>
                  <td style={{ ...tdDisc, fontWeight: 800, color: stt.color }}>{stt.label}</td>
                  <td style={{ ...tdDisc, whiteSpace: 'nowrap' }}>
                    <button onClick={() => edit(c)} style={linkBtn}>Editar</button>
                    <button onClick={() => toggleActive(c)} style={linkBtn}>{c.is_active ? 'Desactivar' : 'Activar'}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="modal-overlay" onClick={() => setForm(null)}>
          <div role="dialog" aria-label={form.id ? 'Editar cupón' : 'Crear cupón'} onClick={(e) => e.stopPropagation()} style={{ backgroundColor: '#FFF', width: '100%', maxWidth: '520px', borderRadius: '12px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 900 }}>{form.id ? `Editar ${form.code}` : 'Nuevo cupón'}</h2>
              <button onClick={() => setForm(null)} aria-label="Cerrar"><X size={20} /></button>
            </div>
            <form onSubmit={save} noValidate style={{ display: 'grid', gap: '0.8rem' }}>
              <label style={labelStyle}>Código<input style={inputStyle} value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} /></label>
              <label style={labelStyle}>Descripción<input style={inputStyle} value={form.description} onChange={(e) => set({ description: e.target.value })} /></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <label style={labelStyle}>Tipo
                  <select style={inputStyle} value={form.discount_type} onChange={(e) => set({ discount_type: e.target.value })}>
                    {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                {form.discount_type !== 'free_shipping' && (
                  <label style={labelStyle}>{form.discount_type === 'percent' ? 'Porcentaje' : 'Valor (COP)'}
                    <input style={inputStyle} inputMode="numeric" value={form.discount_value} onChange={(e) => set({ discount_value: e.target.value.replace(/[^0-9]/g, '') })} />
                  </label>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem' }}>
                <label style={labelStyle}>Compra mínima<input style={inputStyle} inputMode="numeric" value={form.min_subtotal} onChange={(e) => set({ min_subtotal: e.target.value.replace(/[^0-9]/g, '') })} /></label>
                <label style={labelStyle}>Usos totales<input style={inputStyle} inputMode="numeric" placeholder="sin límite" value={form.max_uses} onChange={(e) => set({ max_uses: e.target.value.replace(/[^0-9]/g, '') })} /></label>
                <label style={labelStyle}>Por correo<input style={inputStyle} inputMode="numeric" placeholder="sin límite" value={form.max_uses_per_email} onChange={(e) => set({ max_uses_per_email: e.target.value.replace(/[^0-9]/g, '') })} /></label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <label style={labelStyle}>Inicio<input type="datetime-local" style={inputStyle} value={form.starts_at} onChange={(e) => set({ starts_at: e.target.value })} /></label>
                <label style={labelStyle}>Fin<input type="datetime-local" style={inputStyle} value={form.expires_at} onChange={(e) => set({ expires_at: e.target.value })} /></label>
              </div>
              <label style={{ fontSize: '0.85rem' }}><input type="checkbox" checked={form.is_active} onChange={(e) => set({ is_active: e.target.checked })} /> Activo</label>
              {formError && <div role="alert" style={{ color: '#B91C1C', fontWeight: 600, fontSize: '0.85rem' }}>{formError}</div>}
              <button type="submit" disabled={saving} style={{ backgroundColor: '#09090B', color: '#FFF', padding: '0.85rem', borderRadius: '6px', fontWeight: 800 }}>
                {saving ? 'Guardando…' : 'Guardar cupón'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const thDisc = { padding: '0.85rem 1rem', fontSize: '0.75rem', fontWeight: 800, color: '#71717A', letterSpacing: '0.05em' };
const tdDisc = { padding: '0.85rem 1rem', color: '#09090B' };
const linkBtn = { textDecoration: 'underline', fontSize: '0.8rem', fontWeight: 700, marginRight: '0.6rem' };
const labelStyle = { display: 'grid', gap: '0.3rem', fontSize: '0.78rem', fontWeight: 700, color: '#09090B' };
const inputStyle = { width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #D4D4D8', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 500 };

export default AdminDiscountsPage;
