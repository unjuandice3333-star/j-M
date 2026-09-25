import React from 'react';
import { MessageCircle } from 'lucide-react';

export const WhatsAppButton = ({ message = 'Hola J&M Fashion Store, me gustaría recibir asesoría sobre prendas masculinas.' }) => {
  const phoneNumber = '573000000000'; // Phone number placeholder for Colombia
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 99,
        backgroundColor: '#25D366',
        color: '#FFFFFF',
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 8px 24px rgba(37, 211, 102, 0.35)',
        transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        cursor: 'pointer'
      }}
      title="Asesoría instantánea por WhatsApp"
      onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.08)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
    >
      <MessageCircle size={28} />
    </a>
  );
};

export default WhatsAppButton;
