// =============================================================================
// Configuración de la tienda — métodos y tarifas de envío (public.shipping_methods; RLS: solo admin escribe).
// La BD calcula el costo de envío de cada cotización y pedido con estos valores. Antes /admin/configuracion
// redirigía al dashboard.
// =============================================================================
import React, { useEffect, useState } from 'react';
import { Plus, Edit, X } from 'lucide-react';
import { formatCOP } from '../../utils/currency';
import shippingAdminService, { CHECKOUT_METHOD, emptyShippingMethod, toShippingForm, validateShippingMethod } from '../../services/shippingAdminService';

const btnDark = { backgroundColor: '#09090B', color: '#FFFFFF', padding: '0.7rem 1.2rem', borderRadius: 6, fontWeight: 800, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' };
const btnLight = { backgroundColor: '#FFFFFF', border: '1px solid #E4E4E7', padding: '0.4rem 0.8rem', minHeight: 36, borderRadius: 4, fontSize: '0.78rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' };
const input = { padding: '0.55rem', border: '1px solid #D4D4D8', borderRadius: 6, width: '100%' };
const label = { display: 'grid', gap: '0.3rem', fontSize: '0.8rem', fontWeight: 700, color: '#3F3F46' };
const err = { color: '#B91C1C', fontSize: '0.75rem', fontWeight: 600 };
const th = { textAlign: 'left', padding: '0.7rem', fontSize: '0.72rem', fontWeight: 800, color: '#71717A', borderBottom: '1px solid #E4E4E7' };
const td = { padding: '0.7rem', fontSize: '0.85rem', borderBottom: '1px solid #F4F4F5' };

export const AdminSettingsPage = () => {
  const [methods, setMethods] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try { setMethods(await shippingAdminService.list()); setLoadError(null); } catch (e) { setLoadError(e.message); }
  };
  useEffect(() => { load(); }, []);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const open = (f) => { setErrors({}); setNotice(null); setForm(f); };

  const save = async (e) => {
    e.preventDefault();
    const { errors: v } = validateShippingMethod(form);
    setErrors(v);
    if (Object.keys(v).length) return;
    setSaving(true);
    try {
      const row = await shippingAdminService.save(form);
      setNotice({ ok: true, text: `Método «${row.name}» guardado. Los nuevos pedidos ya usan esta tarifa.` });
      setForm(null);
      await load();
    } catch (ex) { setErrors(ex.errors ?? { form: ex.message }); } finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>CONFIGURACIÓN · ENVÍOS</h1>
          <p style={{ fontSize: '0.88rem', color: '#71717A', maxWidth: 720 }}>
            La tarifa y el umbral de envío gratis se aplican en el servidor a cada cotización y pedido nuevo. El checkout usa el método
            «{CHECKOUT_METHOD}». Los textos de la tienda (cabecera, pie, ficha de producto y página de envíos) muestran el umbral y la tarifa vigentes del método «standard».
          </p>
        </div>
        <button type="button" onClick={() => open(emptyShippingMethod())} style={btnDark}><Plus size={16} /> NUEVO MÉTODO</button>
      </div>

      {notice && <div role={notice.ok ? 'status' : 'alert'} style={{ color: notice.ok ? '#065F46' : '#B91C1C', fontWeight: 600 }}>{notice.text}</div>}
      {loadError && <div role="alert" style={{ color: '#B91C1C', fontWeight: 600 }}>{loadError}</div>}

      <div style={{ backgroundColor: '#FFF', border: '1px solid #E4E4E7', borderRadius: 10, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead><tr><th style={th}>CÓDIGO</th><th style={th}>NOMBRE</th><th style={th}>TARIFA</th><th style={th}>GRATIS DESDE</th><th style={th}>ENTREGA</th><th style={th}>ESTADO</th><th style={th} /></tr></thead>
          <tbody>
            {methods.map((m) => (
              <tr key={m.code} data-testid="shipping-row">
                <td style={td}><code>{m.code}</code></td>
                <td style={td}>{m.name}</td>
                <td style={td}>{formatCOP(m.cost)}</td>
                <td style={td}>{m.free_over_subtotal ? formatCOP(m.free_over_subtotal) : '—'}</td>
                <td style={td}>{m.eta_text ?? '—'}</td>
                <td style={{ ...td, fontWeight: 800, color: m.is_active ? '#065F46' : '#52525B' }}>{m.is_active ? 'ACTIVO' : 'INACTIVO'}</td>
                <td style={td}><button type="button" aria-label={`Editar ${m.name}`} onClick={() => open(toShippingForm(m))} style={btnLight}><Edit size={14} /> Editar</button></td>
              </tr>
            ))}
            {!loadError && methods.length === 0 && <tr><td style={td} colSpan={7}>No hay métodos de envío configurados.</td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <div role="dialog" aria-modal="true" aria-label={form.isNew ? 'Nuevo método de envío' : 'Editar método de envío'} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(9,9,11,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <form onSubmit={save} noValidate style={{ backgroundColor: '#FFF', borderRadius: 10, padding: '1.5rem', width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto', display: 'grid', gap: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontWeight: 900, textTransform: 'uppercase' }}>{form.isNew ? 'Nuevo método de envío' : 'Editar método de envío'}</h2>
              <button type="button" aria-label="Cerrar" style={{ minWidth: 36, minHeight: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setForm(null)}><X size={18} /></button>
            </div>
            <label style={label}>Código
              <input style={input} value={form.code} disabled={!form.isNew} onChange={(e) => set({ code: e.target.value })} />
              {errors.code && <span style={err}>{errors.code}</span>}
            </label>
            <label style={label}>Nombre<input style={input} value={form.name} onChange={(e) => set({ name: e.target.value })} />{errors.name && <span style={err}>{errors.name}</span>}</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <label style={label}>Tarifa (COP)<input style={input} inputMode="numeric" value={form.cost} onChange={(e) => set({ cost: e.target.value })} />{errors.cost && <span style={err}>{errors.cost}</span>}</label>
              <label style={label}>Envío gratis desde (COP, opcional)<input style={input} inputMode="numeric" value={form.free_over_subtotal} onChange={(e) => set({ free_over_subtotal: e.target.value })} />{errors.free_over_subtotal && <span style={err}>{errors.free_over_subtotal}</span>}</label>
            </div>
            <label style={label}>Tiempo de entrega<input style={input} value={form.eta_text} onChange={(e) => set({ eta_text: e.target.value })} />{errors.eta_text && <span style={err}>{errors.eta_text}</span>}</label>
            <label style={label}>Orden<input style={input} inputMode="numeric" value={form.sort_order} onChange={(e) => set({ sort_order: e.target.value })} />{errors.sort_order && <span style={err}>{errors.sort_order}</span>}</label>
            <label style={{ ...label, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><input type="checkbox" checked={form.is_active} onChange={(e) => set({ is_active: e.target.checked })} /> Activo</label>
            {errors.is_active && <span style={err}>{errors.is_active}</span>}
            {errors.form && <div role="alert" style={err}>{errors.form}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" onClick={() => setForm(null)} style={btnLight}>Cancelar</button>
              <button type="submit" disabled={saving} style={btnDark}>{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminSettingsPage;
