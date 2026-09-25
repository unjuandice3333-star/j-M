import React, { useState } from 'react';
import { Star, Check, X, MessageSquare, ThumbsUp, ShieldCheck } from 'lucide-react';
import { REVIEWS } from '../../data/mockData';

export const AdminReviewsPage = () => {
  const [reviewsList, setReviewsList] = useState(
    REVIEWS.map((r) => ({ ...r, status: 'aprobada' }))
  );
  const [replyText, setReplyText] = useState({});

  const handleStatusChange = (id, newStatus) => {
    setReviewsList(
      reviewsList.map((r) => (r.id === id ? { ...r, status: newStatus } : r))
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* HEADER */}
      <div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>
          MODERACIÓN DE REVIEWS & OPINIONES ({reviewsList.length})
        </h1>
        <p style={{ fontSize: '0.88rem', color: '#71717A' }}>
          Gestiona los testimonios de clientes, aprueba reseñas con foto y publica respuestas oficiales.
        </p>
      </div>

      {/* RATING BREAKDOWN KPI */}
      <div style={{ backgroundColor: '#FFFFFF', padding: '1.5rem', borderRadius: '10px', border: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', gap: '3rem' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.8rem', fontWeight: 900, color: '#09090B' }}>4.9</div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.2rem' }}>
            {[...Array(5)].map((_, i) => (
              <Star key={i} size={16} fill="#D4AF37" color="#D4AF37" />
            ))}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#71717A', fontWeight: 600 }}>Promedio de 94 opiniones</div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem', borderLeft: '1px solid #E4E4E7', paddingLeft: '2rem' }}>
          {[
            { stars: 5, pct: '92%' },
            { stars: 4, pct: '6%' },
            { stars: 3, pct: '2%' },
            { stars: 2, pct: '0%' },
            { stars: 1, pct: '0%' }
          ].map((bar) => (
            <div key={bar.stars} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', fontSize: '0.8rem' }}>
              <span style={{ width: '40px', fontWeight: 700 }}>{bar.stars} ★</span>
              <div style={{ flex: 1, height: '8px', backgroundColor: '#F4F4F5', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: bar.pct, height: '100%', backgroundColor: '#D4AF37' }}></div>
              </div>
              <span style={{ width: '35px', color: '#71717A', fontWeight: 600 }}>{bar.pct}</span>
            </div>
          ))}
        </div>
      </div>

      {/* REVIEWS MODERATION LIST */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {reviewsList.map((rev) => (
          <div key={rev.id} style={{ backgroundColor: '#FFFFFF', padding: '1.5rem', borderRadius: '10px', border: '1px solid #E4E4E7', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#09090B' }}>{rev.author} ({rev.city})</span>
                  {rev.verified && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, backgroundColor: '#D1FAE5', color: '#065F46', padding: '2px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <ShieldCheck size={12} /> Comprador Verificado
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#71717A', marginTop: '0.2rem' }}>{rev.date}</div>
              </div>

              {/* Status Badge */}
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: '4px',
                backgroundColor: rev.status === 'aprobada' ? '#D1FAE5' : '#FEE2E2',
                color: rev.status === 'aprobada' ? '#065F46' : '#991B1B'
              }}>
                {rev.status.toUpperCase()}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '2px' }}>
              {[...Array(rev.rating)].map((_, i) => (
                <Star key={i} size={14} fill="#D4AF37" color="#D4AF37" />
              ))}
            </div>

            <h4 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#09090B' }}>{rev.title}</h4>
            <p style={{ fontSize: '0.88rem', color: '#27272A', lineHeight: 1.5 }}>"{rev.comment}"</p>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', borderTop: '1px solid #F4F4F5', paddingTop: '0.8rem' }}>
              <button
                onClick={() => handleStatusChange(rev.id, 'aprobada')}
                style={{ backgroundColor: '#065F46', color: '#FFFFFF', padding: '0.4rem 0.8rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, border: 'none', cursor: 'pointer' }}
              >
                APROBAR
              </button>

              <button
                onClick={() => handleStatusChange(rev.id, 'rechazada')}
                style={{ backgroundColor: '#FFFFFF', color: '#E11D48', border: '1px solid #E11D48', padding: '0.4rem 0.8rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}
              >
                OCULTAR
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminReviewsPage;
