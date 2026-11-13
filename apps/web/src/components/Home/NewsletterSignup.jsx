import React, { useRef, useState } from 'react';
import { Mail, Check } from '../Common/icons';
import { subscribeNewsletter, validateNewsletterEmail } from '../../services/newsletterService';

/**
 * «Únete al club J&M» (portada). Guarda el correo con la RPC subscribe_newsletter; solo confirma si la BD
 * respondió ok. No promete descuentos: no existe un cupón de bienvenida automático.
 */
export const NewsletterSignup = ({ source = 'home' }) => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | done
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  // Ejecución 112 (D83): el aviso se enlaza al campo (aria-describedby) y el foco vuelve a él.
  const fail = (message) => { setError(message); requestAnimationFrame(() => inputRef.current?.focus()); };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (status === 'sending') return;
    const invalid = validateNewsletterEmail(email);
    if (invalid) { fail(invalid); return; }
    setError('');
    setStatus('sending');
    try {
      await subscribeNewsletter(email, source);
      setStatus('done');
    } catch (err) {
      setStatus('idle');
      fail(err.message);
    }
  };

  return (
    <section style={{ padding: '3.25rem 0', backgroundColor: '#FAFAFA' }} aria-labelledby="jm-newsletter-title">
      <div className="jm-container" style={{ textAlign: 'center', maxWidth: '580px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#FFFFFF', border: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
          <Mail size={22} color="#09090B" />
        </div>

        <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.18em', color: '#A16207', textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
          NOVEDADES Y LANZAMIENTOS
        </span>

        <h2 id="jm-newsletter-title" style={{ fontSize: '1.6rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '0.4rem' }}>
          ÚNETE AL CLUB J&M
        </h2>

        <p style={{ fontSize: '0.85rem', color: '#71717A', marginBottom: '1.75rem', lineHeight: 1.5 }}>
          Recibe por correo las nuevas colecciones, lanzamientos y promociones de J&M.
        </p>

        {status === 'done' ? (
          <div role="status" style={{ backgroundColor: '#D1FAE5', color: '#065F46', padding: '0.9rem 1.2rem', borderRadius: '6px', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', border: '1px solid #A7F3D0' }}>
            <Check size={18} /> ¡Listo! Tu correo quedó registrado en el club J&M.
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="email"
                aria-label="Correo electrónico para el boletín"
                placeholder="Tu correo electrónico"
                autoComplete="email"
                maxLength={254}
                value={email}
                ref={inputRef}
                aria-invalid={error ? 'true' : 'false'}
                aria-describedby={error ? `newsletter-${source}-error` : undefined}
                onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
                style={{ flex: 1, minWidth: '0', width: '100%', padding: '0.85rem 1.1rem', border: `1px solid ${error ? '#DC2626' : '#D4D4D8'}`, borderRadius: '6px', fontSize: '0.88rem', outline: 'none', backgroundColor: '#FFFFFF', boxSizing: 'border-box', flexBasis: '240px' }}
              />
              <button
                type="submit"
                disabled={status === 'sending'}
                style={{ backgroundColor: '#09090B', color: '#FFFFFF', padding: '0.85rem 1.8rem', borderRadius: '6px', fontWeight: 800, fontSize: '0.82rem', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: status === 'sending' ? 'wait' : 'pointer', border: 'none', opacity: status === 'sending' ? 0.7 : 1, flexGrow: 1 }}
              >
                {status === 'sending' ? 'Enviando…' : 'Suscribirme'}
              </button>
            </div>
            {error && (
              <span id={`newsletter-${source}-error`} role="alert" style={{ fontSize: '0.8rem', color: '#B91C1C', fontWeight: 600 }}>{error}</span>
            )}
            <span style={{ fontSize: '0.72rem', color: '#71717A', fontWeight: 500, marginTop: '0.2rem' }}>
              Sin spam. Puedes pedir la baja cuando quieras.
            </span>
          </form>
        )}
      </div>
    </section>
  );
};

export default NewsletterSignup;
