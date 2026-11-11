// Ejecución 72 — «Opina sobre tus compras» en Mis pedidos: productos de pedidos entregados sin reseña.
// Se oculta si no hay invitaciones, si la RPC aún no existe en el entorno (migración pendiente) o si falla:
// es una ayuda, no debe tapar el historial de pedidos.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { fetchReviewInvitations } from '../../services/reviewsService';

export function ReviewInvitations({ refreshKey }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let alive = true;
    fetchReviewInvitations()
      .then((rows) => { if (alive) setItems(rows); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [refreshKey]);

  if (items.length === 0) return null;
  return (
    <section aria-labelledby="review-invitations-title" style={{
      backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.25rem',
    }}>
      <h3 id="review-invitations-title" style={{ fontSize: '0.95rem', fontWeight: 800, color: '#09090B', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <Star size={16} fill="#D4AF37" color="#D4AF37" aria-hidden="true" /> OPINA SOBRE TUS COMPRAS
      </h3>
      <p style={{ fontSize: '0.82rem', color: '#71717A', marginBottom: '0.9rem' }}>
        Tu opinión ayuda a otros clientes. Se publica con compra verificada después de revisarla.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.6rem' }}>
        {items.map((it) => (
          <li key={it.orderItemId} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {it.imageUrl && <img src={it.imageUrl} alt="" width={44} height={56} style={{ objectFit: 'cover', borderRadius: 4 }} />}
            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#09090B' }}>{it.productName}</div>
              <div style={{ fontSize: '0.75rem', color: '#71717A' }}>
                Pedido {it.orderNumber}{it.size ? ` · Talla ${it.size}` : ''}{it.color ? ` · ${it.color}` : ''}
              </div>
            </div>
            <Link to={`/producto/${encodeURIComponent(it.slug)}#opiniones`} aria-label={`Opinar sobre ${it.productName}`} style={{
              backgroundColor: '#09090B', color: '#FFFFFF', padding: '0.5rem 0.9rem', borderRadius: 6, fontWeight: 800,
              fontSize: '0.75rem', textTransform: 'uppercase', textDecoration: 'none', whiteSpace: 'nowrap',
            }}>
              Opinar
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default ReviewInvitations;
