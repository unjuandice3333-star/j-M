// M27 — Moderación de reseñas (product_reviews; RLS: solo admin). Solo las aprobadas se muestran en la tienda.
// Ejecución 73: se cargan todas las reseñas una vez (paginadas con fetchAllRows) y se filtran por estado,
// producto y texto sin tildes; contadores por estado; «Guardar respuesta» sin cambiar el estado; la escritura
// sin filas afectadas (RLS) ya no se presenta como éxito; el menú del admin recuenta las pendientes.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { fetchAdminReviews, moderateReview, saveReviewReply } from '../../services/reviewsAdminService';
import { REVIEW_STATUS, REVIEW_REPLY_MAX, countReviewsByStatus, filterReviews, reviewProducts } from '../../utils/reviewsAdmin';

const TABS = ['pending', 'approved', 'rejected', 'todas'];
const btn = { padding: '0.5rem 1rem', borderRadius: 6, fontWeight: 700, border: '1px solid #D4D4D8', backgroundColor: '#FFF', cursor: 'pointer' };

export const AdminReviewsPage = () => {
  const userId = useAuthStore((s) => s.user?.id);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [productId, setProductId] = useState('');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState(null);
  const [replies, setReplies] = useState({});
  const [busy, setBusy] = useState(null);
  const seq = useRef(0);

  const load = async () => {
    const mine = ++seq.current; // descarta respuestas viejas si se recarga dos veces seguidas
    try {
      const { reviews: rows, capped } = await fetchAdminReviews();
      if (mine !== seq.current) return;
      setReviews(rows);
      if (capped) setNotice({ ok: false, text: `Se muestran las primeras ${rows.length} reseñas.` });
    } catch (e) {
      if (mine === seq.current) setNotice({ ok: false, text: e.message || 'No se pudieron cargar las reseñas.' });
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const products = useMemo(() => reviewProducts(reviews), [reviews]);
  // Si el producto elegido ya no tiene reseñas (p. ej. se eliminó), volver a «todos».
  useEffect(() => { if (productId && !products.some((p) => p.id === productId)) setProductId(''); }, [products, productId]);
  const scoped = useMemo(() => filterReviews(reviews, { productId, query }), [reviews, productId, query]);
  const counts = useMemo(() => countReviewsByStatus(scoped), [scoped]);
  const visible = useMemo(() => filterReviews(scoped, { status: filter }), [scoped, filter]);

  const replyOf = (r) => replies[r.id] ?? r.admin_reply ?? '';
  const run = async (r, action, okText) => {
    setBusy(r.id); setNotice(null);
    try {
      await action();
      setReplies((x) => { const { [r.id]: _drop, ...rest } = x; return rest; });
      setNotice({ ok: true, text: okText });
      await load();
    } catch (e) {
      setNotice({ ok: false, text: e.message || 'No se pudo guardar la reseña.' });
    } finally { setBusy(null); }
  };
  const moderate = (r, status) => run(r, () => moderateReview(r.id, status, replyOf(r), userId), `Reseña de ${r.author_name}: ${REVIEW_STATUS[status].toLowerCase()}.`);
  const saveReply = (r) => run(r, () => saveReviewReply(r.id, replyOf(r)), `Respuesta guardada en la reseña de ${r.author_name}.`);

  const emptyText = loading ? 'Cargando reseñas…'
    : reviews.length === 0 ? 'Todavía no hay reseñas.'
      : 'No hay reseñas con estos filtros.';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>RESEÑAS</h1>
        <p style={{ fontSize: '0.88rem', color: '#71717A' }}>Solo las reseñas aprobadas aparecen en la tienda.</p>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.75rem', fontWeight: 700, color: '#52525B', gap: 4 }}>
          Producto
          <select aria-label="Filtrar por producto" value={productId} onChange={(e) => setProductId(e.target.value)}
            style={{ padding: '0.45rem', border: '1px solid #D4D4D8', borderRadius: 6, minWidth: 220, maxWidth: '100%' }}>
            <option value="">Todos los productos</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.total}{p.pending ? ` · ${p.pending} pendiente${p.pending === 1 ? '' : 's'}` : ''})</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.75rem', fontWeight: 700, color: '#52525B', gap: 4, flex: '1 1 220px' }}>
          Buscar
          <input type="search" aria-label="Buscar reseñas" placeholder="Autor, ciudad, título, comentario…" value={query} onChange={(e) => setQuery(e.target.value)}
            style={{ padding: '0.5rem', border: '1px solid #D4D4D8', borderRadius: 6 }} />
        </label>
      </div>
      <div role="tablist" aria-label="Estado de la reseña" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {TABS.map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} style={{ padding: '0.4rem 0.8rem', borderRadius: 6, fontWeight: 700, fontSize: '0.8rem',
            border: '1px solid #E4E4E7', backgroundColor: filter === f ? '#09090B' : '#FFF', color: filter === f ? '#FFF' : '#52525B', cursor: 'pointer' }}>
            {f === 'todas' ? 'Todas' : REVIEW_STATUS[f]} ({counts[f]})
          </button>
        ))}
      </div>
      {notice && <div role={notice.ok ? 'status' : 'alert'} style={{ color: notice.ok ? '#065F46' : '#B91C1C', fontWeight: 600 }}>{notice.text}</div>}
      {visible.length === 0 && <div style={{ color: '#71717A' }}>{emptyText}</div>}
      {visible.map((r) => {
        const reply = replyOf(r);
        const replyChanged = reply.trim() !== (r.admin_reply ?? '').trim();
        const tooLong = reply.trim().length > REVIEW_REPLY_MAX;
        return (
          <article key={r.id} aria-label={`Reseña de ${r.author_name}: ${r.title}`} style={{ backgroundColor: '#FFF', border: '1px solid #E4E4E7', borderRadius: 10, padding: '1.25rem', display: 'grid', gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div><strong>{r.author_name}</strong>{r.city ? ` (${r.city})` : ''} · {r.products?.name} · {new Date(r.created_at).toLocaleDateString('es-CO')}{r.is_verified_buyer ? ' · compra verificada' : ''}</div>
              <span style={{ fontWeight: 800 }}>{REVIEW_STATUS[r.status]}</span>
            </div>
            <div style={{ display: 'flex', gap: 2 }} role="img" aria-label={`${r.rating} de 5`}>{[...Array(r.rating)].map((_, i) => <Star key={i} size={14} fill="#D4AF37" color="#D4AF37" />)}</div>
            <div style={{ fontWeight: 700 }}>{r.title}</div>
            <p style={{ color: '#52525B', fontSize: '0.88rem' }}>{r.comment}</p>
            <textarea aria-label="Respuesta de la tienda" placeholder="Respuesta pública de la tienda (opcional)" value={reply} rows={2}
              onChange={(e) => setReplies((x) => ({ ...x, [r.id]: e.target.value }))} style={{ padding: '0.55rem', border: `1px solid ${tooLong ? '#B91C1C' : '#D4D4D8'}`, borderRadius: 6, resize: 'vertical', font: 'inherit' }} />
            {tooLong && <div style={{ color: '#B91C1C', fontSize: '0.78rem' }}>Máximo {REVIEW_REPLY_MAX} caracteres ({reply.trim().length}).</div>}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {r.status !== 'approved' && <button disabled={busy === r.id || tooLong} onClick={() => moderate(r, 'approved')} style={{ ...btn, backgroundColor: '#09090B', color: '#FFF', border: 'none', fontWeight: 800 }}>Aprobar</button>}
              {r.status !== 'rejected' && <button disabled={busy === r.id || tooLong} onClick={() => moderate(r, 'rejected')} style={btn}>Rechazar</button>}
              {replyChanged && <button disabled={busy === r.id || tooLong} onClick={() => saveReply(r)} style={btn}>Guardar respuesta</button>}
            </div>
          </article>
        );
      })}
    </div>
  );
};

export default AdminReviewsPage;
