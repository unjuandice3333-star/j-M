import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, ShieldCheck, Truck, RotateCcw, MapPin, Mail, ChevronRight, Check } from 'lucide-react';
import { CATEGORIES, OCCASIONS } from '../data/mockData';
import ProductCard from '../components/Product/ProductCard';
import CompleteTheLook from '../components/Product/CompleteTheLook';
import { useECommerceStore } from '../store/eCommerceStore';

export const HomePage = () => {
  const navigate = useNavigate();
  const { products, openFitGuide } = useECommerceStore();

  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterSubscribed, setNewsletterSubscribed] = useState(false);

  const activeProducts = products.filter((p) => p.status !== 'borrador' && p.status !== 'archivado');
  const newProducts = activeProducts.filter((p) => p.isNew);
  const bestSellerProducts = activeProducts.filter((p) => p.isBestSeller);

  const handleNewsletterSubmit = (e) => {
    e.preventDefault();
    if (newsletterEmail) {
      setNewsletterSubscribed(true);
    }
  };

  return (
    <div style={{ backgroundColor: '#FFFFFF' }}>
      {/* 1. HERO SECTION */}
      <section style={{
        position: 'relative',
        height: '85vh',
        minHeight: '580px',
        maxHeight: '800px',
        backgroundColor: '#09090B',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center'
      }}>
        {/* Background Editorial Fashion Image */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'url("https://images.unsplash.com/photo-1490578474895-699cd4e2cf59?auto=format&fit=crop&q=80&w=2000")',
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          opacity: 0.55
        }} />

        {/* Gradient Overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to right, rgba(9,9,11,0.95) 0%, rgba(9,9,11,0.6) 50%, transparent 100%)'
        }} />

        {/* Hero Content */}
        <div className="jm-container" style={{ position: 'relative', zIndex: 10, color: '#FFFFFF' }}>
          <div style={{ maxWidth: '640px' }} className="animate-fade-in">
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: 'rgba(212, 175, 55, 0.15)',
              border: '1px solid #D4AF37',
              color: '#D4AF37',
              fontSize: '0.75rem',
              fontWeight: 800,
              letterSpacing: '0.15em',
              padding: '6px 14px',
              borderRadius: '999px',
              marginBottom: '1.25rem',
              textTransform: 'uppercase'
            }}>
              <Sparkles size={14} /> COLECCIÓN MASCULINA 2026
            </span>

            <h1 style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: 'clamp(2.5rem, 5vw, 4.2rem)',
              fontWeight: 900,
              letterSpacing: '0.04em',
              lineHeight: 1.05,
              marginBottom: '1.2rem',
              textTransform: 'uppercase'
            }}>
              TU ESTILO.<br />TU ESENCIA.
            </h1>

            <p style={{
              fontSize: 'clamp(1rem, 1.5vw, 1.2rem)',
              color: '#D4D4D8',
              lineHeight: 1.6,
              marginBottom: '2rem',
              fontWeight: 400
            }}>
              Descubre prendas de ingeniería textil superior diseñadas exclusivamente para el hombre moderno en Colombia.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
              <button
                onClick={() => navigate('/ropa')}
                style={{
                  backgroundColor: '#FFFFFF',
                  color: '#09090B',
                  padding: '1.1rem 2.2rem',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.92rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  transition: 'transform 0.15s, background 0.15s'
                }}
              >
                COMPRAR AHORA <ArrowRight size={18} />
              </button>

              <button
                onClick={openFitGuide}
                style={{
                  backgroundColor: 'transparent',
                  color: '#FFFFFF',
                  border: '1px solid rgba(255,255,255,0.4)',
                  padding: '1.1rem 1.8rem',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase'
                }}
              >
                ¿CÓMO ES EL FIT?
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 2. NUEVOS PRODUCTOS */}
      <section style={{ padding: '4.5rem 0' }}>
        <div className="jm-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem' }}>
            <div>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.12em', color: '#71717A', textTransform: 'uppercase' }}>
                RECIÉN LLEGADOS
              </span>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', marginTop: '0.2rem' }}>
                NUEVA COLECCIÓN
              </h2>
            </div>
            <Link to="/nuevo" style={{ fontSize: '0.88rem', fontWeight: 700, color: '#09090B', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              VER TODO <ChevronRight size={18} />
            </Link>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '1.5rem'
          }}>
            {newProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>

      {/* 3. CATEGORÍAS PRINCIPALES */}
      <section style={{ padding: '3.5rem 0', backgroundColor: '#FAFAFA' }}>
        <div className="jm-container">
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.12em', color: '#71717A', textTransform: 'uppercase' }}>
              EXPLORA EL CATÁLOGO
            </span>
            <h2 style={{ fontSize: '2rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', marginTop: '0.2rem' }}>
              CATEGORÍAS DESTACADAS
            </h2>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '1.25rem'
          }}>
            {CATEGORIES.map((cat) => (
              <Link
                key={cat.id}
                to={`/ropa/${cat.slug}`}
                style={{
                  position: 'relative',
                  height: '280px',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'flex-end',
                  padding: '1.5rem',
                  textDecoration: 'none',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.06)'
                }}
              >
                <img
                  src={cat.image}
                  alt={cat.name}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transition: 'transform 0.4s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.06)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                />
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to top, rgba(9,9,11,0.85) 0%, rgba(9,9,11,0.2) 60%, transparent 100%)'
                }} />
                <div style={{ position: 'relative', zIndex: 10, color: '#FFFFFF' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#D4AF37', letterSpacing: '0.1em' }}>
                    {activeProducts.filter((p) => p.category === cat.slug).length || cat.count} PRENDAS
                  </span>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, textTransform: 'uppercase', marginTop: '0.1rem' }}>
                    {cat.name}
                  </h3>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 4. COMPRA POR OCASIÓN */}
      <section style={{ padding: '4.5rem 0' }}>
        <div className="jm-container">
          <div style={{ marginBottom: '2.5rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.12em', color: '#71717A', textTransform: 'uppercase' }}>
              ENCUENTRA TU ESTILO SEGÚN EL MOMENTO
            </span>
            <h2 style={{ fontSize: '2rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', marginTop: '0.2rem' }}>
              COMPRA POR OCASIÓN
            </h2>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '1.5rem'
          }}>
            {OCCASIONS.map((occ) => (
              <Link
                key={occ.id}
                to={`/colecciones?ocasion=${occ.id}`}
                style={{
                  position: 'relative',
                  height: '240px',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  padding: '1.5rem',
                  textDecoration: 'none'
                }}
              >
                <img
                  src={occ.image}
                  alt={occ.name}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transition: 'transform 0.4s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                />
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to top, rgba(9,9,11,0.9) 0%, transparent 80%)'
                }} />
                <div style={{ position: 'relative', zIndex: 10, color: '#FFFFFF' }}>
                  <h3 style={{ fontSize: '1.35rem', fontWeight: 900, textTransform: 'uppercase' }}>
                    {occ.name}
                  </h3>
                  <p style={{ fontSize: '0.82rem', color: '#D4D4D8', marginTop: '0.25rem' }}>
                    {occ.subtitle}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 5. MÁS VENDIDOS */}
      <section style={{ padding: '4.5rem 0', backgroundColor: '#FAFAFA' }}>
        <div className="jm-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem' }}>
            <div>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.12em', color: '#71717A', textTransform: 'uppercase' }}>
                PRENDAS ICONO
              </span>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', marginTop: '0.2rem' }}>
                MÁS VENDIDOS
              </h2>
            </div>
            <Link to="/mas-vendidos" style={{ fontSize: '0.88rem', fontWeight: 700, color: '#09090B', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              VER TODOS <ChevronRight size={18} />
            </Link>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '1.5rem'
          }}>
            {bestSellerProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>

      {/* 6. COMPLETA EL LOOK EDITORIAL */}
      <section style={{ padding: '2.5rem 0' }}>
        <div className="jm-container">
          <CompleteTheLook lookId="look-1" />
        </div>
      </section>

      {/* 7. PROPUESTA DE VALOR J&M */}
      <section style={{ padding: '5rem 0', backgroundColor: '#09090B', color: '#FFFFFF' }}>
        <div className="jm-container" style={{ textAlign: 'center', maxWidth: '840px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.2em', color: '#D4AF37', textTransform: 'uppercase' }}>
            LA PROMESA J&M FASHION STORE
          </span>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 900, textTransform: 'uppercase', margin: '0.6rem 0 1.5rem 0' }}>
            CONFECCIÓN COLOMBIANA CON ESTÁNDARES INTERNACIONALES
          </h2>
          <p style={{ fontSize: '1rem', color: '#A1A1AA', lineHeight: 1.7, marginBottom: '2.5rem' }}>
            Seleccionamos los textiles de mayor gramaje y suavidad del mercado nacional e internacional. Cada prenda es terminada con controles rigurosos para asegurar que vista impecable tras múltiples lavados.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', textTransform: 'uppercase', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.08em' }}>
            <div style={{ border: '1px solid #27272A', padding: '1.25rem', borderRadius: '8px' }}>
              100% Algodón Seleccionado
            </div>
            <div style={{ border: '1px solid #27272A', padding: '1.25rem', borderRadius: '8px' }}>
              Costuras de Alta Resistencia
            </div>
            <div style={{ border: '1px solid #27272A', padding: '1.25rem', borderRadius: '8px' }}>
              Guía de Fit Transparente
            </div>
          </div>
        </div>
      </section>

      {/* 8. TIENDA FÍSICA BANNER */}
      <section id="tienda-fisica" style={{ padding: '4.5rem 0', backgroundColor: '#FFFFFF' }}>
        <div className="jm-container">
          <div style={{
            backgroundColor: '#FAFAFA',
            border: '1px solid #E4E4E7',
            borderRadius: '16px',
            overflow: 'hidden',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            alignItems: 'center'
          }}>
            <div style={{ padding: '3rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#D4AF37', fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                <MapPin size={18} /> EXPERIENCIA EN TIENDA FÍSICA
              </div>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', marginBottom: '1rem' }}>
                PRUÉBATE NUESRAS PRENDAS EN PERSONA
              </h2>
              <p style={{ fontSize: '0.92rem', color: '#71717A', lineHeight: 1.6, marginBottom: '1.8rem' }}>
                Visita nuestros showrooms exclusivos en Bogotá y Medellín. Nuestro personal te asesorará para encontrar el fit perfecto según tu morfología.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.88rem', fontWeight: 600, color: '#27272A' }}>
                <div>📍 Flagship Bogotá: Zona T / Calle 82 # 12-34</div>
                <div>📍 Flagship Medellín: El Poblado / Cra 37 # 10-15</div>
              </div>
            </div>

            <div style={{ height: '100%', minHeight: '320px', position: 'relative' }}>
              <img
                src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=1000"
                alt="Tienda Física J&M"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 9. NEWSLETTER */}
      <section style={{ padding: '4rem 0', backgroundColor: '#F4F4F5', borderTop: '1px solid #E4E4E7' }}>
        <div className="jm-container" style={{ textAlign: 'center', maxWidth: '620px' }}>
          <Mail size={32} color="#09090B" style={{ margin: '0 auto 1rem auto' }} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#09090B', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
            ÚNETE AL CLUB J&M
          </h2>
          <p style={{ fontSize: '0.88rem', color: '#71717A', marginBottom: '1.75rem' }}>
            Recibe 10% de descuento en tu primera compra y entérate antes que nadie de los lanzamientos exclusivos.
          </p>

          {newsletterSubscribed ? (
            <div style={{ backgroundColor: '#D1FAE5', color: '#065F46', padding: '1rem', borderRadius: '6px', fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <Check size={18} /> ¡Gracias por suscribirte! Revisa tu correo para usar tu 10% OFF.
            </div>
          ) : (
            <form onSubmit={handleNewsletterSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="email"
                required
                placeholder="Tu correo electrónico"
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
                style={{
                  flex: 1,
                  padding: '0.9rem 1.1rem',
                  border: '1px solid #D4D4D8',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                style={{
                  backgroundColor: '#09090B',
                  color: '#FFFFFF',
                  padding: '0 1.8rem',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase'
                }}
              >
                SUSCRIBIRME
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
};

export default HomePage;
