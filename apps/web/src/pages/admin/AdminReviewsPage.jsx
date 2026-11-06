// M27 — Moderación de reseñas (product_reviews; RLS: solo admin). Solo las aprobadas se muestran en la tienda.
// Antes: reseñas simuladas con un estado local que no se guardaba.
import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import supabase from '../../config/supabase';
import { adminError } from '../../services/adminService';
import { useAuthStore } from '../../store/authStore';

const STATUS = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' };

export const AdminReviewsPage = () => {
  const userId = useAuthStore((s) => s.user?.id);
  const [reviews, setReviews] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [notice, setNotice] = useState(null);
  const [replies, setReplies] = useState({});

  const load = async () => {
    let q = supabase.from('product_reviews').select('id, author_name, city, rating, title, comment, status, admin_reply, is_verified_buyer, created_at, products ( name, slug )')
      .order('created_at', { ascending: false });
    if (filter !== 'todas') q = q.eq('status', filter);
    const { data, error } = await q;
    if (error) setNotice({ ok: false, text: 'No se pudieron cargar las reseñas.' }); else setReviews(data);
  };
  useEffect(() => { load(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const moderate = async (r, status) => {
    const { error } = await supabase.from('product_reviews').update({
      status, admin_reply: (replies[r.id] ?? r.admin_reply ?? '').trim() || null, moderated_by: userId, moderated_at: new Date().toISOString(),
    }).eq('id', r.id);
    if (error) setNotice({ ok: false, text: adminError(error).message });
    else { setNotice({ ok: true, text: `Reseña de ${r.author_name}: ${STATUS[status].toLowerCase()}.` }); load(); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>RESEÑAS</h1>
        <p style={{ fontSize: '0.88rem', color: '#71717A' }}>Solo las reseñas aprobadas aparecen en la tienda.</p>
      </div>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        {['pending', 'approved', 'rejected', 'todas'].map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '0.4rem 0.8rem', borderRadius: 6, fontWeight: 700, fontSize: '0.8rem',
            border: '1px solid #E4E4E7', backgroundColor: filter === f ? '#09090B' : '#FFF', color: filter === f ? '#FFF' : '#52525B' }}>
            {f === 'todas' ? 'Todas' : STATUS[f]}
          </button>
        ))}
      </div>
      {notice && <div role={notice.ok ? 'status' : 'alert'} style={{ color: notice.ok ? '#065F46' : '#B91C1C', fontWeight: 600 }}>{notice.text}</div>}
      {reviews.length === 0 && <div style={{ color: '#71717A' }}>No hay reseñas en este estado.</div>}
      {reviews.map((r) => (
        <div key={r.id} style={{ backgroundColor: '#FFF', border: '1px solid #E4E4E7', borderRadius: 10, padding: '1.25rem', display: 'grid', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div><strong>{r.author_name}</strong>{r.city ? ` (${r.city})` : ''} · {r.products?.name} · {new Date(r.created_at).toLocaleDateString('es-CO')}{r.is_verified_buyer ? ' · compra verificada' : ''}</div>
            <span style={{ fontWeight: 800 }}>{STATUS[r.status]}</span>
          </div>
          <div style={{ display: 'flex', gap: 2 }} aria-label={`${r.rating} de 5`}>{[...Array(r.rating)].map((_, i) => <Star key={i} size={14} fill="#D4AF37" color="#D4AF37" />)}</div>
          <div style={{ fontWeight: 700 }}>{r.title}</div>
          <p style={{ color: '#52525B', fontSize: '0.88rem' }}>{r.comment}</p>
          <input aria-label="Respuesta de la tienda" placeholder="Respuesta pública de la tienda (opcional)" value={replies[r.id] ?? r.admin_reply ?? ''}
            onChange={(e) => setReplies((x) => ({ ...x, [r.id]: e.target.value }))} style={{ padding: '0.55rem', border: '1px solid #D4D4D8', borderRadius: 6 }} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {r.status !== 'approved' && <button onClick={() => moderate(r, 'approved')} style={{ backgroundColor: '#09090B', color: '#FFF', padding: '0.5rem 1rem', borderRadius: 6, fontWeight: 800 }}>Aprobar</button>}
            {r.status !== 'rejected' && <button onClick={() => moderate(r, 'rejected')} style={{ border: '1px solid #D4D4D8', padding: '0.5rem 1rem', borderRadius: 6, fontWeight: 700 }}>Rechazar</button>}
          </div>
        </div>
      ))}
    </div>
  );
};

export default AdminReviewsPage;
