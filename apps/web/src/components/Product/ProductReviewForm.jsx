// Ejecución 71: el cliente opina sobre un producto que compró (migración 20261111180000).
// La BD verifica la compra y deja la reseña pendiente hasta que el admin la apruebe en /admin/reviews.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { useAuthStore } from '../../store/authStore.js';
import { fetchMyReviewables, submitReview, validateReview, REVIEW_LIMITS } from '../../services/reviewsService.js';

const STATUS_TEXT = {
  pending: 'Tu opinión está pendiente de aprobación. La publicaremos cuando la revisemos.',
  approved: 'Tu opinión está publicada. ¡Gracias!',
  rejected: 'Tu opinión no fue publicada porque no cumple nuestras normas de la comunidad.',
};

const box = { border: '1px solid #E4E4E7', borderRadius: 8, padding: '1.25rem', backgroundColor: '#FFF', marginBottom: '1.5rem' };
const label = { display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.3rem', color: '#27272A' };
const input = { width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #D4D4D8', borderRadius: 6, fontSize: '0.9rem', boxSizing: 'border-box' };
const errText = { color: '#B91C1C', fontSize: '0.78rem', marginTop: '0.25rem' };

const purchaseLabel = (it) => [it.orderNumber, [it.color, it.size].filter(Boolean).join(' · ')].filter(Boolean).join(' — ');

export const ProductReviewForm = ({ productId }) => {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const userId = useAuthStore((s) => s.user?.id);
  const [items, setItems] = useState(null); // null = cargando
  const [unavailable, setUnavailable] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [itemId, setItemId] = useState('');
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [city, setCity] = useState('');
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = async () => {
    try {
      const rows = await fetchMyReviewables(productId);
      setItems(rows);
      setLoadError(null);
      const open = rows.find((r) => !r.review);
      setItemId((cur) => (rows.some((r) => r.orderItemId === cur && !r.review) ? cur : open?.orderItemId ?? ''));
    } catch (e) {
      if (e.missing) setUnavailable(true);
      else setLoadError(e.message);
      setItems([]);
    }
  };

  useEffect(() => {
    setItems(null); setUnavailable(false); setNotice(null);
    if (!isLoggedIn || !productId) return;
    load();
  }, [isLoggedIn, userId, productId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!productId || unavailable) return null;

  if (!isLoggedIn) {
    return (
      <div style={box} data-testid="review-form">
        <p style={{ fontSize: '0.88rem', color: '#52525B', margin: 0 }}>
          ¿Compraste este producto? <Link to="/cuenta" style={{ fontWeight: 700, color: '#09090B' }}>Inicia sesión</Link> para contarnos qué te pareció.
        </p>
      </div>
    );
  }

  if (items === null) return <div style={box} data-testid="review-form" role="status">Cargando tus compras…</div>;

  const reviewed = items.filter((r) => r.review);
  const open = items.filter((r) => !r.review);

  const onSubmit = async (e) => {
    e.preventDefault();
    setNotice(null);
    const v = validateReview({ rating, title, comment, city });
    if (!itemId) v.item = 'Elige la compra sobre la que quieres opinar.';
    setErrors(v);
    if (Object.keys(v).length) return;
    setSending(true);
    try {
      await submitReview({ orderItemId: itemId, rating, title, comment, city });
      setRating(0); setTitle(''); setComment(''); setCity('');
      setNotice({ ok: true, text: '¡Gracias! Recibimos tu opinión; la publicaremos cuando la revisemos.' });
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err.message });
      await load();
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={box} data-testid="review-form">
      <h3 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', margin: '0 0 0.75rem' }}>Tu opinión</h3>
      {loadError && <div role="alert" style={errText}>{loadError}</div>}
      {notice && <div role={notice.ok ? 'status' : 'alert'} style={{ ...(notice.ok ? { color: '#065F46', fontWeight: 600 } : errText), marginBottom: '0.75rem' }}>{notice.text}</div>}

      {reviewed.map((r) => (
        <div key={r.orderItemId} data-testid="my-review" style={{ fontSize: '0.85rem', color: '#3F3F46', marginBottom: '0.6rem' }}>
          <strong>{r.review.title}</strong> ({r.review.rating} de 5) · {purchaseLabel(r)}
          <div>{STATUS_TEXT[r.review.status] ?? ''}</div>
          {r.review.adminReply && <div style={{ color: '#52525B' }}>Respuesta de J&M: {r.review.adminReply}</div>}
        </div>
      ))}

      {!loadError && items.length === 0 && (
        <p style={{ fontSize: '0.88rem', color: '#52525B', margin: 0 }}>
          Solo los clientes que compraron este producto pueden opinar. Podrás hacerlo cuando se confirme el pago de tu pedido.
        </p>
      )}

      {open.length > 0 && (
        <form onSubmit={onSubmit} noValidate style={{ display: 'grid', gap: '0.85rem' }}>
          {open.length > 1 ? (
            <div>
              <label style={label} htmlFor="review-item">Compra</label>
              <select id="review-item" style={input} value={itemId} onChange={(e) => setItemId(e.target.value)}>
                {open.map((it) => <option key={it.orderItemId} value={it.orderItemId}>{purchaseLabel(it)}</option>)}
              </select>
              {errors.item && <div style={errText}>{errors.item}</div>}
            </div>
          ) : (
            <p style={{ fontSize: '0.8rem', color: '#71717A', margin: 0 }}>Compra: {purchaseLabel(open[0])}</p>
          )}

          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={label}>Calificación</legend>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-pressed={rating === n} aria-label={`${n} de 5 estrellas`} className="jm-tap" onClick={() => setRating(n)}
                  style={{ background: 'none', border: 0, padding: 2, cursor: 'pointer' }}>
                  <Star size={22} fill={n <= rating ? '#D4AF37' : 'none'} color="#D4AF37" />
                </button>
              ))}
            </div>
            {errors.rating && <div style={errText}>{errors.rating}</div>}
          </fieldset>

          <div>
            <label style={label} htmlFor="review-title">Título</label>
            <input id="review-title" style={input} value={title} maxLength={REVIEW_LIMITS.titleMax} onChange={(e) => setTitle(e.target.value)} />
            {errors.title && <div style={errText}>{errors.title}</div>}
          </div>
          <div>
            <label style={label} htmlFor="review-comment">Comentario</label>
            <textarea id="review-comment" style={{ ...input, minHeight: 96, resize: 'vertical' }} value={comment}
              maxLength={REVIEW_LIMITS.commentMax} onChange={(e) => setComment(e.target.value)} />
            {errors.comment && <div style={errText}>{errors.comment}</div>}
          </div>
          <div>
            <label style={label} htmlFor="review-city">Ciudad (opcional)</label>
            <input id="review-city" style={input} value={city} maxLength={REVIEW_LIMITS.cityMax} onChange={(e) => setCity(e.target.value)} />
            {errors.city && <div style={errText}>{errors.city}</div>}
          </div>
          <p style={{ fontSize: '0.75rem', color: '#71717A', margin: 0 }}>
            Se publicará con tu nombre y la inicial de tu apellido después de que la revisemos.
          </p>
          <button type="submit" disabled={sending}
            style={{ justifySelf: 'start', padding: '0.7rem 1.4rem', backgroundColor: '#09090B', color: '#FFF', border: 0, borderRadius: 6, fontWeight: 800, cursor: 'pointer' }}>
            {sending ? 'Enviando…' : 'Enviar opinión'}
          </button>
        </form>
      )}
    </div>
  );
};

export default ProductReviewForm;
