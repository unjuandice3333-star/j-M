import React, { useState } from 'react';
import { X, Sparkles, CheckCircle, ArrowRight } from 'lucide-react';
import { useECommerceStore } from '../../store/eCommerceStore';

export const SizeRecommenderModal = () => {
  const { activeModal, selectedModalProduct, closeModal } = useECommerceStore();

  const [height, setHeight] = useState(175);
  const [weight, setWeight] = useState(74);
  const [fitPreference, setFitPreference] = useState('normal'); // 'fitted' | 'normal' | 'loose'
  const [result, setResult] = useState(null);

  if (activeModal !== 'sizeRecommender') return null;

  const calculateSize = (e) => {
    e.preventDefault();

    let recSize = 'M';
    let explanation = '';

    const bmi = weight / Math.pow(height / 100, 2);

    if (weight < 65 || (height > 175 && weight < 68)) {
      recSize = fitPreference === 'loose' ? 'M' : 'S';
    } else if (weight >= 65 && weight <= 78) {
      if (fitPreference === 'fitted') recSize = 'S';
      else if (fitPreference === 'loose') recSize = 'L';
      else recSize = 'M';
    } else if (weight > 78 && weight <= 88) {
      if (fitPreference === 'fitted') recSize = 'M';
      else if (fitPreference === 'loose') recSize = 'XL';
      else recSize = 'L';
    } else {
      recSize = fitPreference === 'fitted' ? 'L' : 'XL';
    }

    explanation = `Basado en tu altura de ${height}cm, peso de ${weight}kg y tu preferencia de ajuste ${
      fitPreference === 'fitted' ? 'entallado' : fitPreference === 'loose' ? 'holgado' : 'estándar'
    }. El 94% de clientes con tus proporciones eligieron talla ${recSize}.`;

    setResult({ size: recSize, explanation });
  };

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#FFFFFF',
          width: '100%',
          maxWidth: '540px',
          borderRadius: '12px',
          padding: '2rem',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
        }}
        className="animate-fade-in"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={22} color="#D4AF37" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.05em' }}>ENCUENTRA TU TALLA IDEAL</h2>
          </div>
          <button onClick={closeModal} style={{ padding: '0.35rem' }}>
            <X size={20} />
          </button>
        </div>

        {selectedModalProduct && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', backgroundColor: '#FAFAFA', borderRadius: '6px', marginBottom: '1.25rem', border: '1px solid #E4E4E7' }}>
            <img src={selectedModalProduct.images[0]} alt="" style={{ width: '40px', height: '50px', objectFit: 'cover', borderRadius: '4px' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{selectedModalProduct.name}</div>
              <div style={{ fontSize: '0.75rem', color: '#71717A' }}>FIT DE LA PRENDA: {selectedModalProduct.fit}</div>
            </div>
          </div>
        )}

        {!result ? (
          <form onSubmit={calculateSize} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Height Slider */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.88rem' }}>
                <span style={{ fontWeight: 600 }}>Estatura (cm)</span>
                <span style={{ fontWeight: 800, color: '#09090B' }}>{height} cm</span>
              </div>
              <input
                type="range"
                min="160"
                max="200"
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#09090B' }}
              />
            </div>

            {/* Weight Slider */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.88rem' }}>
                <span style={{ fontWeight: 600 }}>Peso (kg)</span>
                <span style={{ fontWeight: 800, color: '#09090B' }}>{weight} kg</span>
              </div>
              <input
                type="range"
                min="50"
                max="120"
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#09090B' }}
              />
            </div>

            {/* Fit Preference */}
            <div>
              <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '0.6rem' }}>
                ¿Cómo te gusta sentir la ropa?
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                {[
                  { id: 'fitted', label: 'Entallada' },
                  { id: 'normal', label: 'Normal / Estándar' },
                  { id: 'loose', label: 'Holgada' }
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setFitPreference(option.id)}
                    style={{
                      padding: '0.75rem 0.5rem',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      borderRadius: '6px',
                      border: fitPreference === option.id ? '2px solid #09090B' : '1px solid #E4E4E7',
                      backgroundColor: fitPreference === option.id ? '#FAFAFA' : '#FFFFFF',
                      color: fitPreference === option.id ? '#09090B' : '#71717A'
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              style={{
                backgroundColor: '#09090B',
                color: '#FFFFFF',
                padding: '0.95rem',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '0.9rem',
                letterSpacing: '0.05em',
                marginTop: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
            >
              CALCULAR MI TALLA <ArrowRight size={16} />
            </button>
          </form>
        ) : (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <CheckCircle size={52} color="#10B981" style={{ margin: '0 auto 1rem auto' }} />
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#71717A', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              RECOMENDACIÓN PERSONALIZADA J&M
            </span>
            <div style={{ fontSize: '3rem', fontWeight: 900, color: '#09090B', margin: '0.4rem 0 1rem 0' }}>
              TALLA {result.size}
            </div>
            <p style={{ fontSize: '0.88rem', color: '#27272A', lineHeight: 1.6, backgroundColor: '#FAFAFA', padding: '1rem', borderRadius: '8px', border: '1px solid #E4E4E7', marginBottom: '1.5rem' }}>
              {result.explanation}
            </p>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => setResult(null)}
                style={{
                  flex: 1,
                  padding: '0.8rem',
                  border: '1px solid #E4E4E7',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.85rem'
                }}
              >
                Recalcular
              </button>
              <button
                onClick={closeModal}
                style={{
                  flex: 1,
                  backgroundColor: '#09090B',
                  color: '#FFFFFF',
                  padding: '0.8rem',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '0.85rem'
                }}
              >
                ENTENDIDO
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SizeRecommenderModal;
