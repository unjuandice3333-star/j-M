// =============================================================================
// Crear / editar producto — contrato admin_upsert_product (M24): colores del catálogo, imágenes por color (Storage o
// https), variantes color × talla del grupo de tallas de la categoría, stock inicial por variante, slug y referencia.
// M27: reescrito. Antes: colores de texto libre, imágenes en base64, sin referencia ni slug, datos de ejemplo
// precargados y llamadas a funciones inexistentes. El stock de variantes existentes se ajusta en Inventario
// (admin_adjust_inventory, con trazabilidad); aquí solo se fija el stock INICIAL de variantes nuevas.
// =============================================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, Save, Upload, Trash2, Star } from '../../components/Common/icons';
import { productService, imageUrl } from '../../services/productService';
import { adminService, slugify, toReference } from '../../services/adminService';
import { useECommerceStore } from '../../store/eCommerceStore';
import { errorId, fieldA11y, focusFirstError, groupA11y } from '../../utils/formErrors';

// Orden visual del formulario: al guardar con errores el foco va al primero (D80).
const PRODUCT_FIELDS = ['name', 'reference', 'slug', 'category', 'price', 'compareAt', 'cost', 'colors', 'images', 'sizes', 'stock'];
const badStock = (v) => v !== '' && !(Number.isInteger(Number(v)) && Number(v) >= 0);

const FITS = ['SLIM', 'REGULAR', 'RELAXED', 'OVERSIZE'];
const REF_RE = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const emptyForm = () => ({
  id: null, name: '', reference: '', slug: '', refTouched: false, slugTouched: false,
  category: '', styleLine: '', fit: 'REGULAR', occasions: [], description: '', detailsText: '', fitDescription: '',
  price: '', compareAt: '', cost: '', isNew: false, isBestSeller: false, status: 'draft',
  colors: [],            // [{ slug, isDefault, images: [{ storage_path?, external_url?, preview }] }]
  sizes: [],             // códigos de talla del grupo de la categoría
  stock: {},             // `${color}|${size}` → stock inicial (solo variantes nuevas)
  existing: {},          // `${color}|${size}` → { id, sku, stock, reserved, is_active }
});

export const AdminProductFormPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('editId');
  const reloadStore = useECommerceStore((st) => st.loadProducts);

  const [ref, setRef] = useState(null);       // datos de referencia de la BD
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const formRef = useRef(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [urlInput, setUrlInput] = useState({});

  // Datos de referencia y, si se edita, el producto completo
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await productService.getReferenceData();
        if (!alive) return;
        setRef(data);
        if (!editId) { setForm((f) => ({ ...f, category: f.category || data.categories[0]?.slug || '' })); return; }
        const p = await adminService.getProductForEdit(editId);
        if (!alive) return;
        if (!p) { setMessage({ ok: false, text: 'El producto no existe.' }); return; }
        const colorSlugById = new Map(p.product_colors.map((pc) => [pc.color_id, pc.colors.slug]));
        const existing = {};
        for (const v of p.variants) {
          const key = `${colorSlugById.get(v.color_id)}|${v.sizes.code}`;
          const inv = v.inventories?.[0];
          existing[key] = { id: v.id, sku: v.sku, is_active: v.is_active, stock: inv?.stock ?? 0, reserved: inv?.reserved ?? 0 };
        }
        setForm({
          ...emptyForm(), id: p.id, name: p.name, reference: p.reference, slug: p.slug, refTouched: true, slugTouched: true,
          category: p.categories?.slug ?? '', styleLine: p.style_lines?.slug ?? '', fit: p.fit,
          occasions: p.product_occasions.map((po) => po.occasions.slug), description: p.description ?? '',
          detailsText: (p.details ?? []).join('\n'), fitDescription: p.fit_description ?? '',
          price: String(p.base_price), compareAt: p.compare_at_price ? String(p.compare_at_price) : '', cost: p.base_cost != null ? String(p.base_cost) : '',
          isNew: p.is_featured_new, isBestSeller: p.is_bestseller, status: p.status,
          colors: [...p.product_colors].sort((a, b) => a.position - b.position).map((pc) => ({
            slug: pc.colors.slug, isDefault: pc.is_default,
            images: p.product_images.filter((i) => i.color_id === pc.color_id).sort((a, b) => a.position - b.position)
              .map((i) => ({ storage_path: i.storage_path, external_url: i.external_url, alt_text: i.alt_text, preview: imageUrl(i) })),
          })),
          sizes: [...new Set(p.variants.filter((v) => v.is_active).map((v) => v.sizes.code))],
          existing,
        });
      } catch (e) {
        if (alive) setMessage({ ok: false, text: e.message || 'No se pudieron cargar los datos.' });
      }
    })();
    return () => { alive = false; };
  }, [editId]);

  const category = ref?.categories.find((c) => c.slug === form.category);
  const sizeOptions = useMemo(() => (ref?.sizes ?? []).filter((s) => s.size_group === category?.size_group), [ref, category]);
  const colorBySlug = useMemo(() => new Map((ref?.colors ?? []).map((c) => [c.slug, c])), [ref]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const onName = (name) => setForm((f) => ({ ...f, name,
    reference: f.refTouched ? f.reference : toReference(name).slice(0, 40),
    slug: f.slugTouched ? f.slug : slugify(name).slice(0, 80) }));
  const toggleColor = (slug) => setForm((f) => {
    if (f.colors.some((c) => c.slug === slug)) return { ...f, colors: f.colors.filter((c) => c.slug !== slug) };
    return { ...f, colors: [...f.colors, { slug, isDefault: f.colors.length === 0, images: [] }] };
  });
  const setDefaultColor = (slug) => setForm((f) => ({ ...f, colors: f.colors.map((c) => ({ ...c, isDefault: c.slug === slug })) }));
  const toggleSize = (code) => setForm((f) => ({ ...f, sizes: f.sizes.includes(code) ? f.sizes.filter((s) => s !== code) : [...f.sizes, code] }));
  const setColorImages = (slug, fn) => setForm((f) => ({ ...f, colors: f.colors.map((c) => (c.slug === slug ? { ...c, images: fn(c.images) } : c)) }));

  const uploadFiles = async (slug, files) => {
    setUploading(slug); setMessage(null);
    try {
      for (const file of files) {
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error('Formato no admitido (usa JPG, PNG, WebP o AVIF).');
        if (file.size > 5 * 1024 * 1024) throw new Error('Cada imagen debe pesar como máximo 5 MB.');
        const path = await adminService.uploadProductImage(file, form.slug || form.name);
        setColorImages(slug, (imgs) => [...imgs, { storage_path: path, preview: imageUrl({ storage_path: path }) }]);
      }
    } catch (e) {
      setMessage({ ok: false, text: e.message });
    } finally { setUploading(null); }
  };
  const addUrl = (slug) => {
    const url = (urlInput[slug] || '').trim();
    if (!/^https:\/\/\S+$/.test(url)) { setMessage({ ok: false, text: 'La URL de la imagen debe empezar por https://' }); return; }
    setColorImages(slug, (imgs) => [...imgs, { external_url: url, preview: url }]);
    setUrlInput((u) => ({ ...u, [slug]: '' }));
  };

  const validate = (publish) => {
    const e = {};
    if (form.name.trim().length < 2 || form.name.trim().length > 150) e.name = 'Entre 2 y 150 caracteres.';
    if (!REF_RE.test(form.reference)) e.reference = 'Solo MAYÚSCULAS, números y guiones (ej. JM-CAM-001).';
    if (!SLUG_RE.test(form.slug)) e.slug = 'Solo minúsculas, números y guiones (ej. camiseta-oversize-negra).';
    if (!form.category) e.category = 'Elige una categoría.';
    const price = Number(form.price);
    if (!Number.isInteger(price) || price <= 0) e.price = 'Precio en pesos, mayor que 0.';
    if (form.compareAt !== '' && !(Number(form.compareAt) > price)) e.compareAt = 'Debe ser mayor que el precio (o déjalo vacío).';
    if (form.cost !== '' && !(Number(form.cost) >= 0)) e.cost = 'Costo inválido.';
    if (form.colors.length === 0) e.colors = 'Elige al menos un color.';
    if (form.sizes.length === 0) e.sizes = 'Elige al menos una talla.';
    if (publish && !form.colors.some((c) => c.images.length)) e.images = 'Para publicar, agrega al menos una imagen.';
    const bad = Object.entries(form.stock).find(([, v]) => badStock(v));
    if (bad) e.stock = `Stock inicial inválido en ${bad[0].replace('|', ' / ')}.`;
    return e;
  };

  const save = async (publish) => {
    const e = validate(publish);
    setErrors(e);
    if (Object.keys(e).length) { setMessage({ ok: false, text: 'Revisa los campos marcados.' }); focusFirstError(formRef.current, PRODUCT_FIELDS, e); return; }
    setBusy(true); setMessage(null);
    const payload = {
      id: form.id, reference: form.reference, slug: form.slug, name: form.name.trim(), description: form.description.trim() || null,
      details: form.detailsText.split('\n').map((d) => d.trim()).filter(Boolean), fit: form.fit, fit_description: form.fitDescription.trim() || null,
      category: form.category, style_line: form.styleLine || null, occasions: form.occasions,
      base_price: Number(form.price), compare_at_price: form.compareAt === '' ? null : Number(form.compareAt), base_cost: form.cost === '' ? null : Number(form.cost),
      is_featured_new: form.isNew, is_bestseller: form.isBestSeller,
      colors: form.colors.map((c) => ({ color: c.slug, is_default: c.isDefault,
        images: c.images.map((i) => (i.storage_path ? { storage_path: i.storage_path, alt_text: form.name } : { external_url: i.external_url, alt_text: form.name })) })),
      variants: form.colors.flatMap((c) => form.sizes.map((size) => {
        const key = `${c.slug}|${size}`; const ex = form.existing[key];
        return { id: ex?.id, color: c.slug, size, sku: ex?.sku, initial_stock: ex ? undefined : Number(form.stock[key] || 0) };
      })),
    };
    try {
      const r = await adminService.upsertProduct(payload);
      const productId = r.product_id;
      if (publish) await adminService.setProductStatus(productId, 'active');
      await reloadStore(true);
      setMessage({ ok: true, text: publish ? 'Producto guardado y publicado.' : 'Producto guardado como borrador.' });
      if (!form.id) navigate(`/admin/productos/nuevo?editId=${productId}`, { replace: true });
      else set({ status: publish ? 'active' : form.status });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally { setBusy(false); }
  };

  // Ejecución 104: también mientras carga (o si falla la carga) la página tiene su <h1> (foco al cambiar de ruta, D74).
  if (!ref) return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>{editId ? 'EDITAR PRODUCTO' : 'NUEVO PRODUCTO'}</h1>
      <div role="status">{message?.text ?? 'Cargando…'}</div>
    </div>
  );
  // Sin role="alert" por campo: el aviso general ya es alerta y el foco va al primer campo, que lee su mensaje (D80).
  const firstBadStock = Object.entries(form.stock).find(([, v]) => badStock(v))?.[0];
  const Err = ({ k }) => (errors[k] ? <div id={errorId('pf', k)} style={{ color: '#E11D48', fontSize: '0.75rem', fontWeight: 700, marginTop: '0.25rem' }}>{errors[k]}</div> : null);

  return (
    <form ref={formRef} onSubmit={(e) => { e.preventDefault(); save(false); }} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '960px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button type="button" aria-label="Volver" onClick={() => navigate('/admin/productos')} style={{ border: '1px solid #E4E4E7', padding: '0.5rem', borderRadius: '6px', backgroundColor: '#FFFFFF' }}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>
              {form.id ? 'EDITAR PRODUCTO' : 'NUEVO PRODUCTO'}
            </h1>
            <p style={{ fontSize: '0.85rem', color: '#71717A' }}>
              Estado: <strong>{{ draft: 'Borrador', active: 'Publicado', archived: 'Archivado' }[form.status]}</strong>
              {form.status === 'active' && <> · <Link to={`/producto/${form.slug}`} target="_blank" style={{ textDecoration: 'underline' }}>ver en la tienda</Link></>}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button type="submit" disabled={busy} style={{ border: '1px solid #09090B', padding: '0.75rem 1.1rem', borderRadius: '6px', fontWeight: 800, display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <Save size={16} /> {busy ? 'Guardando…' : 'Guardar borrador'}
          </button>
          <button type="button" disabled={busy} onClick={() => save(true)} style={{ backgroundColor: '#09090B', color: '#FFF', padding: '0.75rem 1.1rem', borderRadius: '6px', fontWeight: 800 }}>
            {form.status === 'active' ? 'Guardar cambios' : 'Guardar y publicar'}
          </button>
        </div>
      </div>

      {message && <div role={message.ok ? 'status' : 'alert'} style={{ padding: '0.8rem 1rem', borderRadius: '8px', fontWeight: 600,
        backgroundColor: message.ok ? '#ECFDF5' : '#FEF2F2', color: message.ok ? '#065F46' : '#B91C1C' }}>{message.text}</div>}

      <section style={card}>
        <h3 style={sectionTitle}>1. DATOS DEL PRODUCTO</h3>
        <label style={labelStyle} htmlFor="pf-name">Nombre *</label>
        <input id="pf-name" style={inputStyle} value={form.name} onChange={(e) => onName(e.target.value)} {...fieldA11y(errors, 'pf', 'name')} />
        <Err k="name" />
        <div style={grid2}>
          <div>
            <label style={labelStyle} htmlFor="pf-ref">Referencia *</label>
            <input id="pf-ref" style={inputStyle} value={form.reference} onChange={(e) => set({ reference: e.target.value.toUpperCase(), refTouched: true })} {...fieldA11y(errors, 'pf', 'reference')} />
            <Err k="reference" />
          </div>
          <div>
            <label style={labelStyle} htmlFor="pf-slug">Slug (dirección web) *</label>
            <input id="pf-slug" style={inputStyle} value={form.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase(), slugTouched: true })} {...fieldA11y(errors, 'pf', 'slug')} />
            <Err k="slug" />
          </div>
        </div>
        <div style={grid3}>
          <div>
            <label style={labelStyle} htmlFor="pf-cat">Categoría *</label>
            <select id="pf-cat" style={inputStyle} value={form.category} onChange={(e) => set({ category: e.target.value, sizes: [] })} {...fieldA11y(errors, 'pf', 'category')}>
              {ref.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
            <Err k="category" />
          </div>
          <div>
            <label style={labelStyle} htmlFor="pf-line">Línea de estilo</label>
            <select id="pf-line" style={inputStyle} value={form.styleLine} onChange={(e) => set({ styleLine: e.target.value })}>
              <option value="">Sin línea</option>
              {ref.styleLines.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="pf-fit">Fit</label>
            <select id="pf-fit" style={inputStyle} value={form.fit} onChange={(e) => set({ fit: e.target.value })}>
              {FITS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
        <label style={labelStyle}>Ocasiones</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          {ref.occasions.map((o) => (
            <label key={o.slug} style={{ fontSize: '0.82rem', display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
              <input type="checkbox" checked={form.occasions.includes(o.slug)}
                onChange={() => set({ occasions: form.occasions.includes(o.slug) ? form.occasions.filter((x) => x !== o.slug) : [...form.occasions, o.slug] })} />
              {o.name}
            </label>
          ))}
        </div>
        <label style={labelStyle} htmlFor="pf-desc">Descripción</label>
        <textarea id="pf-desc" rows={3} style={inputStyle} value={form.description} onChange={(e) => set({ description: e.target.value })} />
        <div style={grid2}>
          <div>
            <label style={labelStyle} htmlFor="pf-details">Detalles (uno por línea)</label>
            <textarea id="pf-details" rows={3} style={inputStyle} value={form.detailsText} onChange={(e) => set({ detailsText: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="pf-fitd">Descripción del fit</label>
            <textarea id="pf-fitd" rows={3} style={inputStyle} value={form.fitDescription} onChange={(e) => set({ fitDescription: e.target.value })} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.85rem', marginTop: '0.5rem' }}>
          <label><input type="checkbox" checked={form.isNew} onChange={(e) => set({ isNew: e.target.checked })} /> Destacar como nuevo</label>
          <label><input type="checkbox" checked={form.isBestSeller} onChange={(e) => set({ isBestSeller: e.target.checked })} /> Más vendido</label>
        </div>
      </section>

      <section style={card}>
        <h3 style={sectionTitle}>2. PRECIOS (COP, SIN DECIMALES)</h3>
        <div style={grid3}>
          <div>
            <label style={labelStyle} htmlFor="pf-price">Precio de venta *</label>
            <input id="pf-price" inputMode="numeric" style={inputStyle} value={form.price} onChange={(e) => set({ price: e.target.value.replace(/[^0-9]/g, '') })} {...fieldA11y(errors, 'pf', 'price')} />
            <Err k="price" />
          </div>
          <div>
            <label style={labelStyle} htmlFor="pf-compare">Precio antes (tachado)</label>
            <input id="pf-compare" inputMode="numeric" style={inputStyle} value={form.compareAt} onChange={(e) => set({ compareAt: e.target.value.replace(/[^0-9]/g, '') })} {...fieldA11y(errors, 'pf', 'compareAt')} />
            <Err k="compareAt" />
          </div>
          <div>
            <label style={labelStyle} htmlFor="pf-cost">Costo (interno)</label>
            <input id="pf-cost" inputMode="numeric" style={inputStyle} value={form.cost} onChange={(e) => set({ cost: e.target.value.replace(/[^0-9]/g, '') })} {...fieldA11y(errors, 'pf', 'cost')} />
            <Err k="cost" />
          </div>
        </div>
      </section>

      <section style={card}>
        <h3 style={sectionTitle}>3. COLORES E IMÁGENES</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1rem' }}>
          {ref.colors.map((c, ci) => {
            const on = form.colors.some((x) => x.slug === c.slug);
            const inUse = Object.keys(form.existing).some((k) => k.startsWith(`${c.slug}|`));
            return (
              <button type="button" key={c.slug} onClick={() => (!inUse || !on ? toggleColor(c.slug) : setMessage({ ok: false, text: `${c.name} tiene variantes: no se puede quitar (puedes quitarle las tallas).` }))}
                aria-pressed={on} {...(ci === 0 ? groupA11y(errors, 'pf', 'colors') : {})} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', padding: '0.4rem 0.7rem', borderRadius: '999px',
                  border: on ? '2px solid #09090B' : '1px solid #D4D4D8', fontSize: '0.8rem', fontWeight: 700 }}>
                <span style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: c.hex_code, border: '1px solid #A1A1AA' }} /> {c.name}
              </button>
            );
          })}
        </div>
        <Err k="colors" /><Err k="images" />
        {form.colors.map((c, ci) => (
          <div key={c.slug} style={{ border: '1px solid #E4E4E7', borderRadius: '8px', padding: '1rem', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
              <strong>{colorBySlug.get(c.slug)?.name}</strong>
              <label style={{ fontSize: '0.8rem' }}><input type="radio" name="defaultColor" checked={c.isDefault} onChange={() => setDefaultColor(c.slug)} /> Color principal</label>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
              {c.images.map((img, i) => (
                <div key={`${img.storage_path || img.external_url}-${i}`} style={{ position: 'relative', width: 72, height: 90, borderRadius: 6, overflow: 'hidden', backgroundColor: '#F4F4F5' }}>
                  <img src={img.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', bottom: 2, right: 2, display: 'flex', gap: 2 }}>
                    {i > 0 && <button type="button" aria-label="Usar como primera" onClick={() => setColorImages(c.slug, (imgs) => [img, ...imgs.filter((_, j) => j !== i)])} style={miniBtn}><Star size={12} /></button>}
                    <button type="button" aria-label="Quitar imagen" onClick={() => setColorImages(c.slug, (imgs) => imgs.filter((_, j) => j !== i))} style={miniBtn}><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ ...miniBtnWide, cursor: 'pointer' }}>
                <Upload size={14} /> {uploading === c.slug ? 'Subiendo…' : 'Subir imágenes'}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple hidden
                  aria-label={`Subir imágenes para ${colorBySlug.get(c.slug)?.name}`}
                  onChange={(e) => { uploadFiles(c.slug, [...e.target.files]); e.target.value = ''; }} />
              </label>
              <input placeholder="o pega una URL https://" aria-label={`URL de imagen para ${colorBySlug.get(c.slug)?.name}`} {...(ci === 0 ? fieldA11y(errors, 'pf', 'images') : {})} value={urlInput[c.slug] || ''}
                onChange={(e) => setUrlInput((u) => ({ ...u, [c.slug]: e.target.value }))} style={{ ...inputStyle, width: 'auto', flex: 1, minWidth: 200 }} />
              <button type="button" onClick={() => addUrl(c.slug)} style={miniBtnWide}>Agregar URL</button>
            </div>
          </div>
        ))}
      </section>

      <section style={card}>
        <h3 style={sectionTitle}>4. TALLAS Y STOCK INICIAL</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          {sizeOptions.map((s, si) => (
            <button type="button" key={s.code} aria-pressed={form.sizes.includes(s.code)} {...(si === 0 ? groupA11y(errors, 'pf', 'sizes') : {})} onClick={() => toggleSize(s.code)}
              style={{ minWidth: 48, height: 40, borderRadius: 6, fontWeight: 800, border: '1px solid #D4D4D8',
                backgroundColor: form.sizes.includes(s.code) ? '#09090B' : '#FFF', color: form.sizes.includes(s.code) ? '#FFF' : '#09090B' }}>
              {s.code}
            </button>
          ))}
        </div>
        <Err k="sizes" /><Err k="stock" />
        {form.colors.length > 0 && form.sizes.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead><tr><th style={th}>Color \ Talla</th>{form.sizes.map((s) => <th key={s} style={th}>{s}</th>)}</tr></thead>
              <tbody>
                {form.colors.map((c) => (
                  <tr key={c.slug}>
                    <td style={th}>{colorBySlug.get(c.slug)?.name}</td>
                    {form.sizes.map((s) => {
                      const key = `${c.slug}|${s}`; const ex = form.existing[key];
                      return (
                        <td key={s} style={{ padding: '0.3rem' }}>
                          {ex ? <span title="Ajusta el stock en Inventario">{ex.stock - ex.reserved} disp.</span> : (
                            <input aria-label={`Stock inicial ${colorBySlug.get(c.slug)?.name} ${s}`} {...(errors.stock && key === firstBadStock ? fieldA11y(errors, 'pf', 'stock') : {})} inputMode="numeric" style={{ ...inputStyle, width: 64, padding: '0.35rem' }}
                              value={form.stock[key] ?? ''} placeholder="0" onChange={(e) => set({ stock: { ...form.stock, [key]: e.target.value.replace(/[^0-9]/g, '') } })} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: '0.75rem', color: '#71717A', marginTop: '0.5rem' }}>
              El stock de variantes existentes se modifica en <Link to="/admin/inventario" style={{ textDecoration: 'underline' }}>Inventario</Link> (queda registrado cada movimiento). Quitar una talla desactiva sus variantes; no borra su historial.
            </p>
          </div>
        )}
      </section>
    </form>
  );
};

const card = { backgroundColor: '#FFFFFF', padding: '1.5rem', borderRadius: '10px', border: '1px solid #E4E4E7', display: 'flex', flexDirection: 'column', gap: '0.5rem' };
const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', margin: '0.5rem 0' };
const grid3 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', margin: '0.5rem 0' };
const th = { padding: '0.4rem 0.6rem', textAlign: 'left', fontWeight: 800, color: '#52525B' };
const miniBtn = { backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 4, padding: 3, display: 'flex' };
const miniBtnWide = { border: '1px solid #D4D4D8', borderRadius: 6, padding: '0.45rem 0.8rem', fontSize: '0.8rem', fontWeight: 700, display: 'flex', gap: '0.35rem', alignItems: 'center' };
const sectionTitle = { fontSize: '0.95rem', fontWeight: 900, color: '#09090B', letterSpacing: '0.05em', marginBottom: '0.5rem', textTransform: 'uppercase' };
const labelStyle = { display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#09090B', marginBottom: '0.3rem', marginTop: '0.4rem' };
const inputStyle = { width: '100%', padding: '0.65rem 0.8rem', border: '1px solid #D4D4D8', borderRadius: '6px', fontSize: '0.85rem', outline: 'none' };

export default AdminProductFormPage;
