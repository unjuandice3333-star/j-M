import React from 'react';
import { MessageCircle } from 'lucide-react';

export const WhatsAppButton = ({ message = 'Hola J&M Fashion Store, me gustaría recibir asesoría sobre prendas masculinas.' }) => {
  const phoneNumber = '573000000000'; // Phone number placeholder for Colombia
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;

  return (
    <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 99, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
      {/* Tooltip on hover */}
      <div
        style={{
          backgroundColor: '#09090B',
          color: '#FFFFFF',
          fontSize: '0.75rem',
          fontWeight: 700,
          padding: '6px 12px',
          borderRadius: '20px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
          whiteSpace: 'nowrap',
          border: '1px solid #27272A',
          pointerEvents: 'none'
        }}
      >
        ¿Necesitas ayuda?
      </div>

      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          backgroundColor: '#25D366',
          color: '#FFFFFF',
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 6px 20px rgba(37, 211, 102, 0.35)',
          transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          cursor: 'pointer'
        }}
        title="¿Necesitas ayuda? Habla con un asesor J&M"
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.08)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      >
        <MessageCircle size={24} />
      </a>
    </div>
  );
};

export default WhatsAppButton;
