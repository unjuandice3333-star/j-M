// =============================================================================
// Colecciones y looks — CRUD real sobre public.collections + collection_products (RLS: solo admin escribe).
// Los looks activos alimentan «Completa el look» en la ficha de producto. Antes: ocasiones simuladas sin acciones.
// =============================================================================
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Edit, Trash2, X, ArrowUp, ArrowDown } from 'lucide-react';
import { slugify } from '../../services/adminService';
import collectionsAdminService, { COLLECTION_KINDS, emptyCollection, toCollectionForm, validateCollection } from '../../services/collectionsAdminService';

const btnDark = { backgroundColor: '#09090B', color: '#FFFFFF', padding: '0.7rem 1.2rem', borderRadius: 6, fontWeight: 800, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' };
const btnLight = { backgroundColor: '#FFFFFF', border: '1px solid #E4E4E7', padding: '0.4rem 0.8rem', minHeight: 36, borderRadius: 4, fontSize: '0.78rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' };
const input = { padding: '0.55rem', border: '1px solid #D4D4D8', borderRadius: 6, width: '100%' };
const label = { display: 'grid', gap: '0.3rem', fontSize: '0.8rem', fontWeight: 700, color: '#3F3F46' };
const err = { color: '#B91C1C', fontSize: '0.75rem', fontWeight: 600 };

export const AdminCollectionsPage = () => {
  const [collections, setCollections] = useState([]);
  const [products, setProducts] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [pick, setPick] = useState('');

  const load = async () => {
    try {
      const [c, p] = await Promise.all([collectionsAdminService.list(), collectionsAdminService.listProducts()]);
      setCollections(c); setProducts(p); setLoadError(null);
    } catch (e) { setLoadError(e.message); }
  };
  useEffect(() => { load(); }, []);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const set = (patch) => setForm((f) => {
    const next = { ...f, ...patch };
    if ('name' in patch && !f.slugTouched) next.slug = slugify(patch.name);
    return next;
  });
  const open = (f) => { setErrors({}); setPick(''); setForm(f); };
  const move = (i, d) => set({ productIds: form.productIds.map((id, k, a) => (k === i ? a[i + d] : k === i + d ? a[i] : id)) });

  const save = async (e) => {
    e.preventDefault();
    const { errors: v } = validateCollection(form);
    setErrors(v);
    if (Object.keys(v).length) return;
    setSaving(true);
    try {
      await collectionsAdminService.save(form);
      setNotice({ ok: true, text: `Colección «${form.name.trim()}» guardada.` });
      setForm(null);
      await load();
    } catch (ex) { setErrors(ex.errors ?? { form: ex.message }); } finally { setSaving(false); }
  };

  const remove = async (c) => {
    if (!window.confirm(`¿Eliminar «${c.name}»? Los productos no se borran.`)) return;
    try { await collectionsAdminService.remove(c.id); setNotice({ ok: true, text: `«${c.name}» eliminada.` }); await load(); }
    catch (ex) { setNotice({ ok: false, text: ex.message }); }
  };

  const available = products.filter((p) => !form?.productIds.includes(p.id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>COLECCIONES Y LOOKS ({collections.length})</h1>
          <p style={{ fontSize: '0.88rem', color: '#71717A' }}>Los looks activos aparecen en «Completa el look» de la ficha de producto (solo con productos activos).</p>
        </div>
        <button type="button" onClick={() => open(emptyCollection())} style={btnDark}><Plus size={16} /> NUEVA COLECCIÓN</button>
      </div>

      {notice && <div role={notice.ok ? 'status' : 'alert'} style={{ color: notice.ok ? '#065F46' : '#B91C1C', fontWeight: 600 }}>{notice.text}</div>}
      {loadError && <div role="alert" style={{ color: '#B91C1C', fontWeight: 600 }}>{loadError}</div>}
      {!loadError && collections.length === 0 && <div style={{ color: '#71717A' }}>Aún no hay colecciones. Crea la primera con «Nueva colección».</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
        {collections.map((c) => (
          <div key={c.id} data-testid="collection-card" style={{ backgroundColor: '#FFFFFF', borderRadius: 10, border: '1px solid #E4E4E7', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {c.image_url && <img src={c.image_url} alt={c.name} style={{ width: '100%', height: 140, objectFit: 'cover' }} />}
            <div style={{ padding: '1rem', display: 'grid', gap: '0.4rem', flex: 1 }}>
              <strong style={{ textTransform: 'uppercase' }}>{c.name}</strong>
              <span style={{ fontSize: '0.78rem', color: '#71717A' }}>/{c.slug} · {COLLECTION_KINDS[c.kind]} · orden {c.sort_order}</span>
              {c.subtitle && <p style={{ fontSize: '0.85rem', color: '#52525B' }}>{c.subtitle}</p>}
              <span style={{ fontSize: '0.8rem' }}>{c.collection_products?.length ?? 0} producto(s)</span>
              <div style={{ marginTop: 'auto', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F4F4F5' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: c.is_active ? '#065F46' : '#52525B' }}>{c.is_active ? 'ACTIVA' : 'INACTIVA'}</span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button type="button" onClick={() => open(toCollectionForm(c))} style={btnLight}><Edit size={14} /> Editar</button>
                  <button type="button" aria-label={`Eliminar ${c.name}`} onClick={() => remove(c)} style={btnLight}><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {form && (
        <div role="dialog" aria-modal="true" aria-label={form.id ? 'Editar colección' : 'Nueva colección'} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(9,9,11,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <form onSubmit={save} noValidate style={{ backgroundColor: '#FFF', borderRadius: 10, padding: '1.5rem', width: 'min(640px, 100%)', maxHeight: '90vh', overflowY: 'auto', display: 'grid', gap: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontWeight: 900, textTransform: 'uppercase' }}>{form.id ? 'Editar colección' : 'Nueva colección'}</h2>
              <button type="button" aria-label="Cerrar" style={{ minWidth: 36, minHeight: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setForm(null)}><X size={18} /></button>
            </div>
            <label style={label}>Nombre<input style={input} value={form.name} onChange={(e) => set({ name: e.target.value })} />{errors.name && <span style={err}>{errors.name}</span>}</label>
            <label style={label}>Slug<input style={input} value={form.slug} onChange={(e) => set({ slug: e.target.value, slugTouched: true })} />{errors.slug && <span style={err}>{errors.slug}</span>}</label>
            <label style={label}>Subtítulo<input style={input} value={form.subtitle} onChange={(e) => set({ subtitle: e.target.value })} /></label>
            <label style={label}>Imagen de portada (URL https)<input style={input} value={form.image_url} onChange={(e) => set({ image_url: e.target.value })} />{errors.image_url && <span style={err}>{errors.image_url}</span>}</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <label style={label}>Tipo
                <select style={input} value={form.kind} onChange={(e) => set({ kind: e.target.value })}>
                  {Object.entries(COLLECTION_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label style={label}>Orden<input style={input} inputMode="numeric" value={form.sort_order} onChange={(e) => set({ sort_order: e.target.value })} />{errors.sort_order && <span style={err}>{errors.sort_order}</span>}</label>
            </div>
            <label style={{ ...label, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><input type="checkbox" checked={form.is_active} onChange={(e) => set({ is_active: e.target.checked })} /> Activa (visible en la tienda)</label>

            <fieldset style={{ border: '1px solid #E4E4E7', borderRadius: 8, padding: '0.75rem', display: 'grid', gap: '0.5rem' }}>
              <legend style={{ fontSize: '0.8rem', fontWeight: 800, padding: '0 0.3rem' }}>Productos ({form.productIds.length})</legend>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select aria-label="Producto para agregar" style={input} value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">Selecciona un producto…</option>
                  {available.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.reference}){p.status !== 'active' ? ` · ${p.status}` : ''}</option>)}
                </select>
                <button type="button" disabled={!pick} onClick={() => { set({ productIds: [...form.productIds, pick] }); setPick(''); }} style={btnLight}><Plus size={14} /> Agregar</button>
              </div>
              {form.productIds.map((id, i) => (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                  <span style={{ flex: 1 }}>{i + 1}. {productById.get(id)?.name ?? id}</span>
                  <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)} style={btnLight}><ArrowUp size={12} /></button>
                  <button type="button" aria-label="Bajar" disabled={i === form.productIds.length - 1} onClick={() => move(i, 1)} style={btnLight}><ArrowDown size={12} /></button>
                  <button type="button" aria-label={`Quitar ${productById.get(id)?.name ?? id}`} onClick={() => set({ productIds: form.productIds.filter((x) => x !== id) })} style={btnLight}><X size={12} /></button>
                </div>
              ))}
              {errors.products && <span style={err}>{errors.products}</span>}
            </fieldset>

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

export default AdminCollectionsPage;
