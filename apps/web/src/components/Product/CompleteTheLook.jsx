import React from 'react';
import { ShoppingBag, Sparkles, Check } from 'lucide-react';
import { PRODUCTS, LOOKS, formatCOP } from '../../data/mockData';
import { useECommerceStore } from '../../store/eCommerceStore';

export const CompleteTheLook = ({ lookId = 'look-1' }) => {
  const { addItem } = useECommerceStore();

  const look = LOOKS.find((l) => l.id === lookId) || LOOKS[0];
  const lookProducts = PRODUCTS.filter((p) => look.products.includes(p.id));

  const handleBuyLook = () => {
    lookProducts.forEach((p) => {
      addItem(p, p.sizes[0], p.colors[0], 1);
    });
  };

  return (
    <div style={{
      backgroundColor: '#FAFAFA',
      border: '1px solid #E4E4E7',
      borderRadius: '12px',
      padding: '2rem',
      margin: '3rem 0'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
        <Sparkles size={18} color="#D4AF37" />
        <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.12em', color: '#71717A', textTransform: 'uppercase' }}>
          OUTFIT RECOMENDADO
        </span>
      </div>

      <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#09090B', marginBottom: '0.3rem' }}>
        COMPLETA EL LOOK
      </h2>
      <p style={{ fontSize: '0.88rem', color: '#71717A', marginBottom: '1.75rem' }}>
        {look.subtitle}
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '2rem',
        alignItems: 'center'
      }}>
        {/* Look Cover Editorial Image */}
        <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', aspectRatio: '4/5' }}>
          <img
            src={look.image}
            alt={look.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)',
            display: 'flex',
            alignItems: 'flex-end',
            padding: '1.5rem'
          }}>
            <span style={{ color: '#FFFFFF', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.05em' }}>
              {look.title}
            </span>
          </div>
        </div>

        {/* Bundle Items List & Bundle Price CTA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {lookProducts.map((prod) => (
              <div
                key={prod.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '0.75rem',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '8px',
                  border: '1px solid #E4E4E7'
                }}
              >
                <img
                  src={prod.images[0]}
                  alt={prod.name}
                  style={{ width: '50px', height: '65px', objectFit: 'cover', borderRadius: '4px' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#09090B' }}>{prod.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#71717A' }}>
                    FIT: {prod.fit} • Color: {prod.color}
                  </div>
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#09090B' }}>
                  {formatCOP(prod.price)}
                </div>
              </div>
            ))}
          </div>

          {/* Pricing & Buy Bundle Action */}
          <div style={{
            backgroundColor: '#FFFFFF',
            padding: '1.25rem',
            borderRadius: '8px',
            border: '1px solid #D4AF37',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#71717A', display: 'block' }}>PRECIO TOTAL DEL OUTFIT</span>
                <span style={{ fontSize: '1.35rem', fontWeight: 900, color: '#09090B' }}>
                  {formatCOP(look.bundleDiscountPrice)}
                </span>
                <span style={{ fontSize: '0.82rem', color: '#A1A1AA', textDecoration: 'line-through', marginLeft: '0.5rem' }}>
                  {formatCOP(look.totalPrice)}
                </span>
              </div>

              <span style={{
                backgroundColor: '#D4AF37',
                color: '#09090B',
                fontSize: '0.72rem',
                fontWeight: 800,
                padding: '4px 8px',
                borderRadius: '4px'
              }}>
                AHORRA {formatCOP(look.savings)}
              </span>
            </div>

            <button
              onClick={handleBuyLook}
              style={{
                width: '100%',
                backgroundColor: '#09090B',
                color: '#FFFFFF',
                padding: '0.95rem',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '0.88rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.6rem'
              }}
            >
              <ShoppingBag size={18} /> COMPRAR LOOK COMPLETO
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompleteTheLook;
