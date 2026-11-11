// =============================================================================
// Imágenes de la portada — M28: persistidas en public.site_content + bucket `site-content` de Supabase Storage.
// Antes (M27 FAIL): se guardaban solo en el localStorage del navegador del admin (data: URL en base64) y una
// "biblioteca" con nombres y fechas inventados. Ahora: lectura pública, escritura solo admin (RLS + políticas de
// storage). Los cambios sobreviven a recargas, cierres de sesión y se ven desde cualquier navegador.
// =============================================================================
import React, { useEffect, useState } from 'react';
import { Upload, Check, RotateCcw, FolderOpen, AlertTriangle, X } from 'lucide-react';
import { useECommerceStore, DEFAULT_EDITORIAL_IMAGES } from '../../store/eCommerceStore';
import { useAuthStore } from '../../store/authStore';
import siteContentService, { validateImageFile, publicUrl } from '../../services/siteContentService';
import productService from '../../services/productService';
import { buildEditorialItems } from '../../utils/homeTaxonomy';

const SECTION = { hero: 'Hero', styles: 'Línea de estilo', categories: 'Categoría', occasions: 'Ocasión', outfits: 'Outfit' };
const TAB_LIST = [['hero', 'Hero'], ['styles', 'Líneas de estilo'], ['categories', 'Categorías'],
  ['occasions', 'Ocasiones'], ['outfits', 'Outfits'], ['library', 'Biblioteca']];

const btnDark = { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#09090B', color: '#FFF', padding: '0.6rem 1rem', borderRadius: 6, fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', border: 'none' };
const btnLight = { ...btnDark, backgroundColor: '#FFF', color: '#09090B', border: '1px solid #D4D4D8' };

export const AdminEditorialImagesPage = () => {
  const { siteContent, siteContentError, loadSiteContent } = useECommerceStore();
  const userId = useAuthStore((s) => s.user?.id);
  const [tab, setTab] = useState('todos');
  const [notice, setNotice] = useState(null);           // { ok, text }
  const [library, setLibrary] = useState([]);
  const [libraryError, setLibraryError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(null);         // { item, storagePath, externalUrl, preview, alt }
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(null);

  const loadLibrary = async () => {
    try { setLibrary(await siteContentService.listLibrary()); setLibraryError(null); }
    catch (e) { setLibraryError(e.message); }
  };
  // Entradas a partir de las líneas, categorías y ocasiones activas de la BD (lectura fresca: el admin puede haber
  // creado una categoría hace un momento). Si la BD falla se muestran las de la semilla y se avisa.
  const [taxonomy, setTaxonomy] = useState(null);
  const [taxonomyError, setTaxonomyError] = useState(null);
  useEffect(() => {
    let alive = true;
    productService.getStorefrontTaxonomy()
      .then((t) => { if (alive) { setTaxonomy(t); setTaxonomyError(null); } })
      .catch((e) => { if (alive) setTaxonomyError(e?.message ?? 'No se pudieron cargar las secciones'); });
    return () => { alive = false; };
  }, []);
  const ITEMS = React.useMemo(() => buildEditorialItems(taxonomy), [taxonomy]);
  const TABS = [['todos', `Todas (${ITEMS.length})`], ...TAB_LIST];
  useEffect(() => { loadSiteContent(); loadLibrary(); }, [loadSiteContent]);

  const flash = (ok, text) => { setNotice({ ok, text }); if (ok) setTimeout(() => setNotice(null), 4000); };

  const upload = async (file) => {
    const invalid = validateImageFile(file);
    if (invalid) { flash(false, invalid); return null; }
    setUploading(true);
    try {
      const path = await siteContentService.uploadToLibrary(file);
      await loadLibrary();
      return path;
    } catch (e) { flash(false, e.message); return null; }
    finally { setUploading(false); }
  };

  const openEdit = (item) => {
    const cur = siteContent[item.key];
    setEditing({ item, storagePath: cur?.storagePath ?? null, externalUrl: cur?.storagePath ? '' : (cur?.url ?? ''),
      preview: cur?.url ?? DEFAULT_EDITORIAL_IMAGES[item.key], alt: cur?.alt ?? item.title, error: null });
  };

  const save = async () => {
    setSaving(true);
    try {
      await siteContentService.setImage(editing.item.key, {
        storagePath: editing.storagePath, externalUrl: editing.storagePath ? null : editing.externalUrl.trim(), alt: editing.alt,
      }, userId);
      await loadSiteContent();
      flash(true, `Imagen guardada para «${editing.item.title}». Ya es visible en la tienda.`);
      setEditing(null);
    } catch (e) { setEditing((x) => ({ ...x, error: e.message })); }
    finally { setSaving(false); }
  };

  const reset = async (item) => {
    try { await siteContentService.reset(item.key); await loadSiteContent(); flash(true, `«${item.title}» volvió a la imagen original.`); }
    catch (e) { flash(false, e.message); }
    setConfirmReset(null);
  };

  const items = ITEMS.filter((i) => tab === 'todos' || i.section === tab);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>Imágenes de la página principal</h1>
        <p style={{ fontSize: '0.88rem', color: '#71717A' }}>Los cambios se guardan en la base de datos y se ven al instante en la tienda, desde cualquier dispositivo.</p>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', borderBottom: '1px solid #E4E4E7', paddingBottom: '0.5rem' }}>
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ padding: '0.5rem 0.9rem', borderRadius: 6, fontSize: '0.8rem', border: 'none', cursor: 'pointer',
            fontWeight: tab === id ? 800 : 600, color: tab === id ? '#FFF' : '#71717A', backgroundColor: tab === id ? '#09090B' : 'transparent' }}>{label}</button>
        ))}
      </div>

      {notice && (
        <div role={notice.ok ? 'status' : 'alert'} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 700, fontSize: '0.85rem', padding: '0.8rem 1rem', borderRadius: 8,
          backgroundColor: notice.ok ? '#ECFDF5' : '#FEF2F2', color: notice.ok ? '#065F46' : '#991B1B' }}>
          {notice.ok ? <Check size={16} /> : <AlertTriangle size={16} />}{notice.text}
        </div>
      )}
      {siteContentError && <div role="alert" style={{ color: '#B91C1C', fontWeight: 600 }}>{siteContentError}</div>}
      {taxonomyError && <div role="alert" style={{ color: '#B45309', fontWeight: 600 }}>{taxonomyError}: se muestran las secciones predeterminadas.</div>}

      {tab === 'library' ? (
        <div style={{ backgroundColor: '#FFF', padding: '1.25rem', borderRadius: 10, border: '1px solid #E4E4E7', display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <strong>Biblioteca ({library.length})</strong>
            <label style={btnDark}><Upload size={15} /> {uploading ? 'Subiendo…' : 'Subir imagen'}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={uploading} style={{ display: 'none' }}
                onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f && await upload(f)) flash(true, 'Imagen subida a la biblioteca.'); }} />
            </label>
          </div>
          {libraryError && <div role="alert" style={{ color: '#B91C1C' }}>{libraryError}</div>}
          {library.length === 0 && !libraryError && <div style={{ color: '#71717A' }}>Aún no hay imágenes subidas.</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.8rem' }}>
            {library.map((f) => (
              <figure key={f.path} style={{ margin: 0, border: '1px solid #E4E4E7', borderRadius: 8, overflow: 'hidden' }}>
                <img src={f.url} alt={f.name} style={{ width: '100%', height: 120, objectFit: 'cover', backgroundColor: '#F4F4F5' }} />
                <figcaption style={{ fontSize: '0.7rem', padding: '0.4rem', color: '#52525B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.createdAt ? new Date(f.createdAt).toLocaleDateString('es-CO') : ''} · {f.name}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
          {items.map((item) => {
            const cur = siteContent[item.key];
            const url = cur?.url ?? DEFAULT_EDITORIAL_IMAGES[item.key];
            return (
              <div key={item.key} data-key={item.key} style={{ backgroundColor: '#FFF', borderRadius: 10, border: '1px solid #E4E4E7', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ position: 'relative', height: 160, backgroundColor: '#18181B' }}>
                  <img src={url} alt={cur?.alt ?? item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <span style={{ position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(9,9,11,.85)', color: '#D4AF37', fontSize: '0.65rem', fontWeight: 800, padding: '3px 8px', borderRadius: 4 }}>{SECTION[item.section]}</span>
                  <span style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: cur ? '#065F46' : '#52525B', color: '#FFF', fontSize: '0.65rem', fontWeight: 800, padding: '3px 8px', borderRadius: 4 }}>
                    {cur ? 'PERSONALIZADA' : 'ORIGINAL'}</span>
                </div>
                <div style={{ padding: '0.9rem', display: 'grid', gap: '0.6rem' }}>
                  <div style={{ fontWeight: 800 }}>{item.title}</div>
                  {cur?.updatedAt && <div style={{ fontSize: '0.72rem', color: '#71717A' }}>Actualizada {new Date(cur.updatedAt).toLocaleString('es-CO')}</div>}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button style={btnDark} onClick={() => openEdit(item)} aria-label={`Cambiar imagen ${item.title}`}>Cambiar</button>
                    {cur && <button style={btnLight} onClick={() => setConfirmReset(item)} aria-label={`Restaurar imagen ${item.title}`}><RotateCcw size={14} /> Restaurar</button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => !saving && setEditing(null)}>
          <div role="dialog" aria-label={`Editar ${editing.item.title}`} onClick={(e) => e.stopPropagation()}
            style={{ backgroundColor: '#FFF', width: '100%', maxWidth: 720, borderRadius: 12, padding: '1.5rem', maxHeight: '90vh', overflowY: 'auto', display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 900 }}>{editing.item.title}</h2>
              <button onClick={() => setEditing(null)} aria-label="Cerrar"><X size={20} /></button>
            </div>
            <img src={editing.preview} alt="Vista previa" style={{ width: '100%', height: 220, objectFit: 'cover', borderRadius: 8, backgroundColor: '#F4F4F5' }} />
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <label style={btnDark}><Upload size={15} /> {uploading ? 'Subiendo…' : 'Subir desde el equipo'}
                <input type="file" aria-label="Subir imagen" accept="image/jpeg,image/png,image/webp,image/avif" disabled={uploading} style={{ display: 'none' }}
                  onChange={async (e) => {
                    const f = e.target.files?.[0]; e.target.value = '';
                    const path = f && await upload(f);
                    if (path) setEditing((x) => ({ ...x, storagePath: path, externalUrl: '', preview: publicUrl(path), error: null }));
                  }} />
              </label>
            </div>
            <label style={{ display: 'grid', gap: '0.3rem', fontSize: '0.8rem', fontWeight: 700 }}>O una URL https
              <input value={editing.externalUrl} placeholder="https://…" onChange={(e) => setEditing((x) => ({ ...x, externalUrl: e.target.value, storagePath: null, preview: e.target.value || x.preview }))}
                style={{ padding: '0.55rem', border: '1px solid #D4D4D8', borderRadius: 6, fontWeight: 400 }} />
            </label>
            <label style={{ display: 'grid', gap: '0.3rem', fontSize: '0.8rem', fontWeight: 700 }}>Texto alternativo (accesibilidad)
              <input value={editing.alt} onChange={(e) => setEditing((x) => ({ ...x, alt: e.target.value }))} style={{ padding: '0.55rem', border: '1px solid #D4D4D8', borderRadius: 6, fontWeight: 400 }} />
            </label>
            {library.length > 0 && (
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', display: 'flex', gap: '0.3rem', alignItems: 'center' }}><FolderOpen size={14} /> Elegir de la biblioteca</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: '0.5rem' }}>
                  {library.map((f) => (
                    <button key={f.path} onClick={() => setEditing((x) => ({ ...x, storagePath: f.path, externalUrl: '', preview: f.url, error: null }))} aria-label={`Usar ${f.name}`}
                      style={{ padding: 0, border: editing.storagePath === f.path ? '3px solid #D4AF37' : '1px solid #E4E4E7', borderRadius: 6, overflow: 'hidden', cursor: 'pointer' }}>
                      <img src={f.url} alt="" style={{ width: '100%', height: 70, objectFit: 'cover', display: 'block' }} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {editing.error && <div role="alert" style={{ color: '#B91C1C', fontWeight: 600 }}>{editing.error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button style={btnLight} onClick={() => setEditing(null)} disabled={saving}>Cancelar</button>
              <button style={btnDark} onClick={save} disabled={saving || uploading || (!editing.storagePath && !editing.externalUrl.trim())}>{saving ? 'Guardando…' : 'Guardar y publicar'}</button>
            </div>
          </div>
        </div>
      )}

      {confirmReset && (
        <div className="modal-overlay" onClick={() => setConfirmReset(null)}>
          <div role="dialog" aria-label="Confirmar restauración" onClick={(e) => e.stopPropagation()} style={{ backgroundColor: '#FFF', maxWidth: 420, width: '100%', borderRadius: 12, padding: '1.5rem', display: 'grid', gap: '1rem' }}>
            <div>¿Volver a la imagen original de «{confirmReset.title}»? La imagen subida seguirá en la biblioteca.</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button style={btnLight} onClick={() => setConfirmReset(null)}>Cancelar</button>
              <button style={btnDark} onClick={() => reset(confirmReset)}>Restaurar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminEditorialImagesPage;
