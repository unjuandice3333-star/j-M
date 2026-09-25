import React from 'react';
import { X, Check } from 'lucide-react';
import { useECommerceStore } from '../../store/eCommerceStore';
import { FITS_INFO } from '../../data/mockData';

export const FitGuideModal = () => {
  const { activeModal, closeModal } = useECommerceStore();

  if (activeModal !== 'fitGuide') return null;

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#FFFFFF',
          width: '100%',
          maxWidth: '620px',
          borderRadius: '12px',
          padding: '2rem',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
        }}
        className="animate-fade-in"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '0.05em' }}>¿QUÉ SIGNIFICA EL FIT?</h2>
            <p style={{ fontSize: '0.85rem', color: '#71717A', marginTop: '0.2rem' }}>
              Descubre las siluetas de prendas masculinas de J&M Fashion Store.
            </p>
          </div>
          <button onClick={closeModal} style={{ padding: '0.5rem' }}>
            <X size={22} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {FITS_INFO.map((fit) => (
            <div
              key={fit.name}
              style={{
                border: '1px solid #E4E4E7',
                borderRadius: '8px',
                padding: '1.2rem',
                backgroundColor: '#FAFAFA'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                <span style={{
                  backgroundColor: '#09090B',
                  color: '#FFFFFF',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                  padding: '3px 8px',
                  borderRadius: '4px'
                }}>
                  {fit.name}
                </span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#09090B' }}>{fit.tagline}</span>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#27272A', lineHeight: 1.5, marginBottom: '0.6rem' }}>
                {fit.description}
              </p>
              <div style={{ fontSize: '0.78rem', color: '#71717A', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Check size={14} color="#10B981" /> <strong>Recomendado para:</strong> {fit.recommendedFor}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={closeModal}
          style={{
            width: '100%',
            backgroundColor: '#09090B',
            color: '#FFFFFF',
            padding: '0.9rem',
            borderRadius: '6px',
            fontWeight: 700,
            fontSize: '0.9rem',
            marginTop: '1.5rem'
          }}
        >
          ENTENDIDO
        </button>
      </div>
    </div>
  );
};

export default FitGuideModal;
