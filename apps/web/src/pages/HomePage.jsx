import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, ShieldCheck, Truck, RefreshCw, Headphones, MapPin, Mail, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { CATEGORIES, OCCASIONS, STYLE_LINES } from '../data/mockData';
import ProductCard from '../components/Product/ProductCard';
import CompleteTheLook from '../components/Product/CompleteTheLook';
import { useECommerceStore } from '../store/eCommerceStore';
import SafeImage from '../components/Common/SafeImage';

export const HomePage = () => {
  const navigate = useNavigate();
  const { products, editorialImages } = useECommerceStore();
  const carouselRef = useRef(null);

  const getEditorialImg = (key, fallback) => (editorialImages && editorialImages[key]) ? editorialImages[key] : fallback;

  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterSubscribed, setNewsletterSubscribed] = useState(false);

  const activeProducts = products.filter((p) => p.status !== 'borrador' && p.status !== 'archivado');
  const newProducts = activeProducts.filter((p) => p.isNew);
  const bestSellerProducts = activeProducts.filter((p) => p.isBestSeller);

  const scrollCarousel = (direction) => {
    if (carouselRef.current) {
      const scrollAmount = carouselRef.current.clientWidth * 0.75;
      carouselRef.current.scrollBy({
        left: direction === 'next' ? scrollAmount : -scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const handleNewsletterSubmit = (e) => {
    e.preventDefault();
    if (newsletterEmail) {
      setNewsletterSubscribed(true);
    }
  };

  return (
    <div style={{ backgroundColor: '#FFFFFF' }}>
      {/* 1. HERO SECTION */}
      <section
        role="region"
        aria-label="Campaña principal"
        style={{
          position: 'relative',
          height: '76vh',
          minHeight: '520px',
          maxHeight: '740px',
          backgroundColor: '#09090B',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        {/* Background Editorial Male Fashion Image */}
        <div
          role="img"
          aria-label="Colección Moda Masculina J&M"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url("${getEditorialImg('hero_main', 'https://images.unsplash.com/photo-1490578474895-699cd4e2cf59?auto=format&fit=crop&q=80&w=2000')}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center top',
            opacity: 0.85
          }}
        />

        {/* Localized Gradient Overlay: Rich Left Dark Contrast -> Bright Right Transparency */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, rgba(9,9,11,0.88) 0%, rgba(9,9,11,0.68) 35%, rgba(9,9,11,0.20) 70%, rgba(9,9,11,0.05) 100%)'
          }}
        />

        {/* Hero Content Block - Micro-shifted 16px to the right for editorial balance */}
        <div
          className="jm-container"
          style={{
            position: 'relative',
            zIndex: 10,
            color: '#FFFFFF',
            transform: 'translateY(-6px)',
            width: '100%',
            paddingLeft: 'calc(1rem + 16px)'
          }}
        >
          <div style={{ maxWidth: '560px' }} className="animate-fade-in">
            {/* Refined Eyebrow Badge */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                backgroundColor: 'rgba(212, 175, 55, 0.08)',
                border: '1px solid rgba(212, 175, 55, 0.70)',
                color: '#D4AF37',
                fontSize: '0.66rem',
                fontWeight: 700,
                letterSpacing: '0.22em',
                padding: '4px 11px',
                borderRadius: '999px',
                marginBottom: '0.90rem',
                textTransform: 'uppercase'
              }}
            >
              MODA MASCULINA · COLOMBIA
            </span>

            {/* Campaign Headline (+6% Size Increase, 1.02 Line-Height for High-Impact Editorial Feel) */}
            <h1
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: 'clamp(2.35rem, 4.5vw, 3.75rem)',
                fontWeight: 900,
                letterSpacing: '0.02em',
                lineHeight: 1.02,
                marginBottom: '1.15rem',
                textTransform: 'uppercase'
              }}
            >
              VISTE TU ESTILO.<br />VIVE TU ESENCIA.
            </h1>

            {/* Subtitle Description with 18px Vertical Separation */}
            <p
              style={{
                fontSize: 'clamp(0.90rem, 1.2vw, 1.05rem)',
                color: '#E4E4E7',
                lineHeight: 1.58,
                maxWidth: '540px',
                marginBottom: '1.9rem',
                fontWeight: 400
              }}
            >
              Moda masculina para cada momento. Descubre prendas diseñadas para acompañarte todos los días.
            </p>

            {/* Action CTAs (52px Height, 15px Gap, High Legibility Outline) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.95rem', alignItems: 'center' }}>
              <button
                onClick={() => navigate('/ropa')}
                aria-label="Comprar ahora en la tienda"
                style={{
                  height: '52px',
                  backgroundColor: '#FFFFFF',
                  color: '#09090B',
                  padding: '0 2.2rem',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.86rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.55rem',
                  cursor: 'pointer',
                  border: 'none',
                  transition: 'all 220ms ease-out'
                }}
                className="hero-primary-btn"
              >
                <span>COMPRAR AHORA</span>
                <ArrowRight size={17} className="hero-arrow-icon" style={{ transition: 'transform 220ms ease-out' }} />
              </button>

              <button
                onClick={() => navigate('/colecciones')}
                aria-label="Descubrir colecciones masculinas"
                style={{
                  height: '52px',
                  backgroundColor: 'rgba(9, 9, 11, 0.28)',
                  backdropFilter: 'blur(4px)',
                  WebkitBackdropFilter: 'blur(4px)',
                  color: '#FFFFFF',
                  border: '1.5px solid rgba(255, 255, 255, 0.95)',
                  padding: '0 2.2rem',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.86rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 220ms ease-out'
                }}
                className="hero-secondary-btn"
              >
                DESCUBRIR COLECCIÓN
              </button>
            </div>
          </div>
        </div>

        {/* Micro-interactions & Responsive Styles */}
        <style>{`
          .hero-primary-btn:hover {
            background-color: #F4F4F5 !important;
            transform: translateY(-1px);
            box-shadow: 0 6px 22px rgba(255,255,255,0.22);
          }
          .hero-primary-btn:hover .hero-arrow-icon {
            transform: translateX(4px);
          }
          .hero-secondary-btn:hover {
            background-color: rgba(255, 255, 255, 0.18) !important;
            border-color: #FFFFFF !important;
            transform: translateY(-1px);
          }
          @media (prefers-reduced-motion: reduce) {
            .hero-primary-btn, .hero-secondary-btn, .hero-arrow-icon {
              transition: none !important;
              transform: none !important;
            }
          }
          @media (max-width: 768px) {
            .hero-primary-btn, .hero-secondary-btn {
              width: 100%;
            }
          }
        `}</style>
      </section>

      {/* 2. TRES LÍNEAS DE ESTILO J&M */}
      <section
        role="region"
        aria-label="Líneas de estilo masculinas J&M"
        style={{ padding: '4.5rem 0', backgroundColor: '#09090B', color: '#FFFFFF' }}
      >
        <div className="jm-container">
          {/* Section Header */}
          <div style={{ textAlign: 'center', marginBottom: '2.8rem' }}>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                letterSpacing: '0.22em',
                color: '#D4AF37',
                textTransform: 'uppercase',
                display: 'inline-block',
                marginBottom: '0.4rem'
              }}
            >
              LÍNEAS DE ESTILO J&amp;M
            </span>
            <h2
              style={{
                fontSize: 'clamp(1.45rem, 2.4vw, 2.05rem)',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: '#FFFFFF',
                lineHeight: 1.25,
                margin: 0
              }}
            >
              UNA FORMA DE VESTIR PARA CADA MOMENTO
            </h2>
          </div>

          {/* 3-Column Responsive Grid */}
          <div className="style-lines-grid">
            {STYLE_LINES.map((line) => (
              <div
                key={line.id}
                onClick={() => navigate(`/linea/${line.slug}`)}
                tabIndex={0}
                role="button"
                aria-label={`Explorar línea ${line.name}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/linea/${line.slug}`);
                  }
                }}
                className="style-line-card"
              >
                {/* Background Image with Smooth Hover Zoom */}
                <SafeImage
                  src={getEditorialImg(`style_${line.id}`, line.image)}
                  alt={line.name}
                  className="style-line-img"
                />

                {/* Micro-tuned Progressive Bottom Overlay (Subtle 0.88 max alpha to keep photo vibrant) */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(to top, rgba(9,9,11,0.88) 0%, rgba(9,9,11,0.52) 48%, rgba(9,9,11,0.06) 82%, transparent 100%)',
                    zIndex: 2,
                    pointerEvents: 'none'
                  }}
                />

                {/* Card Content Hierarchy */}
                <div
                  style={{
                    position: 'relative',
                    zIndex: 3,
                    height: '100%',
                    padding: '2rem 1.65rem 1.65rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    color: '#FFFFFF'
                  }}
                >
                  {/* Line Name */}
                  <h3
                    style={{
                      fontFamily: "'Outfit', sans-serif",
                      fontSize: '1.65rem',
                      fontWeight: 900,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      marginBottom: '0.35rem',
                      lineHeight: 1.1,
                      color: '#FFFFFF'
                    }}
                  >
                    {line.name}
                  </h3>

                  {/* Tagline */}
                  <p
                    style={{
                      fontSize: '0.88rem',
                      color: '#E4E4E7',
                      fontWeight: 600,
                      marginBottom: '0.50rem',
                      fontStyle: 'italic',
                      lineHeight: 1.3
                    }}
                  >
                    &quot;{line.tagline}&quot;
                  </p>

                  {/* Description (Enhanced +1px font size & #D4D4D8 contrast) */}
                  <p
                    style={{
                      fontSize: '0.84rem',
                      color: '#D4D4D8',
                      lineHeight: 1.52,
                      marginBottom: '1.2rem',
                      fontWeight: 400
                    }}
                  >
                    {line.description}
                  </p>

                  {/* Editorial Link CTA with Hover Micro-interaction */}
                  <div className="style-line-cta">
                    <span>EXPLORAR LÍNEA</span>
                    <ArrowRight
                      size={16}
                      color="#D4AF37"
                      className="style-line-arrow"
                      style={{ transition: 'transform 280ms cubic-bezier(0.4, 0, 0.2, 1)' }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Embedded Dynamic Card Animations & Micro-interactions */}
        <style>{`
          .style-lines-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 1.5rem;
          }
          @media (max-width: 992px) {
            .style-lines-grid {
              grid-template-columns: repeat(2, 1fr);
            }
          }
          @media (max-width: 640px) {
            .style-lines-grid {
              grid-template-columns: 1fr;
            }
          }
          .style-line-card {
            position: relative;
            height: 420px;
            border-radius: 12px;
            overflow: hidden;
            cursor: pointer;
            border: 1px solid #27272A;
            background-color: #18181B;
            transition: transform 400ms cubic-bezier(0.4, 0, 0.2, 1),
                        border-color 400ms cubic-bezier(0.4, 0, 0.2, 1),
                        box-shadow 400ms cubic-bezier(0.4, 0, 0.2, 1);
          }
          .style-line-card:hover {
            transform: translateY(-3px);
            border-color: rgba(212, 175, 55, 0.55);
            box-shadow: 0 10px 25px rgba(0,0,0,0.45);
          }
          .style-line-img {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform 450ms cubic-bezier(0.4, 0, 0.2, 1);
          }
          .style-line-card:hover .style-line-img {
            transform: scale(1.025);
          }
          .style-line-cta {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.80rem;
            font-weight: 800;
            color: #FFFFFF;
            letter-spacing: 0.10em;
            text-transform: uppercase;
            transition: color 280ms cubic-bezier(0.4, 0, 0.2, 1);
          }
          .style-line-card:hover .style-line-cta {
            color: #D4AF37;
          }
          .style-line-card:hover .style-line-arrow {
            transform: translateX(4px);
          }
          @media (prefers-reduced-motion: reduce) {
            .style-line-card, .style-line-img, .style-line-arrow, .style-line-cta {
              transition: none !important;
              transform: none !important;
            }
          }
        `}</style>
      </section>

      {/* 3. NUEVA COLECCIÓN */}
      <section
        role="region"
        aria-label="Nueva colección recien llegada"
        style={{ padding: '3rem 0' }}
      >
        <div className="jm-container">
          {/* Section Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              marginBottom: '1.5rem'
            }}
          >
            <div>
              <span
                style={{
                  fontSize: '0.70rem',
                  fontWeight: 800,
                  letterSpacing: '0.20em',
                  color: '#D4AF37',
                  textTransform: 'uppercase',
                  display: 'inline-block',
                  marginBottom: '0.25rem'
                }}
              >
                RECIÉN LLEGADOS
              </span>
              <h2
                style={{
                  fontSize: 'clamp(1.4rem, 2.2vw, 1.85rem)',
                  fontWeight: 900,
                  color: '#09090B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  margin: 0
                }}
              >
                NUEVA COLECCIÓN
              </h2>
            </div>
          {/* Carousel Controls & Section Link */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="carousel-nav-btns" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <button
                onClick={() => scrollCarousel('prev')}
                aria-label="Anterior producto"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  border: '1px solid #E4E4E7',
                  backgroundColor: '#FFFFFF',
                  color: '#09090B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                className="carousel-btn"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => scrollCarousel('next')}
                aria-label="Siguiente producto"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  border: '1px solid #E4E4E7',
                  backgroundColor: '#FFFFFF',
                  color: '#09090B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                className="carousel-btn"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <Link
              to="/nuevo"
              style={{
                fontSize: '0.82rem',
                fontWeight: 800,
                color: '#09090B',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                textDecoration: 'none',
                transition: 'color 0.2s ease',
                marginLeft: '0.5rem'
              }}
              className="ver-todo-link"
            >
              <span>VER TODO</span>
              <ChevronRight size={17} className="ver-todo-arrow" style={{ transition: 'transform 0.2s ease' }} />
            </Link>
          </div>
        </div>

        {/* Carousel Scroll Container */}
        <div
          ref={carouselRef}
          className="new-collection-carousel"
          style={{
            display: 'flex',
            gap: '1.25rem',
            overflowX: 'auto',
            scrollSnapType: 'x mandatory',
            scrollBehavior: 'smooth',
            paddingBottom: '0.75rem',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {newProducts.map((product) => (
            <div
              key={product.id}
              className="carousel-item"
              style={{
                flex: '0 0 calc(25% - 0.94rem)',
                minWidth: '240px',
                scrollSnapAlign: 'start'
              }}
            >
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .new-collection-carousel::-webkit-scrollbar {
          display: none;
        }
        .new-collection-carousel {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .carousel-btn:hover {
          border-color: #09090B !important;
          background-color: #F4F4F5 !important;
        }
        .ver-todo-link:hover {
          color: #71717A !important;
        }
        .ver-todo-link:hover .ver-todo-arrow {
          transform: translateX(3px);
        }
        @media (max-width: 1024px) {
          .carousel-item {
            flex: 0 0 calc(33.333% - 0.84rem) !important;
          }
        }
        @media (max-width: 768px) {
          .carousel-item {
            flex: 0 0 calc(50% - 0.625rem) !important;
            min-width: 170px !important;
          }
        }
      `}</style>
      </section>

      {/* 4. CATEGORÍAS DESTACADAS */}
      <section style={{ padding: '3.75rem 0', backgroundColor: '#FAFAFA' }}>
        <div className="jm-container">
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <span
              style={{
                fontSize: '0.70rem',
                fontWeight: 800,
                letterSpacing: '0.20em',
                color: '#D4AF37',
                textTransform: 'uppercase',
                display: 'inline-block',
                marginBottom: '0.35rem'
              }}
            >
              CATÁLOGO DE PRENDAS
            </span>
            <h2
              style={{
                fontSize: 'clamp(1.5rem, 2.3vw, 1.95rem)',
                fontWeight: 900,
                color: '#09090B',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                margin: 0
              }}
            >
              CATEGORÍAS DESTACADAS
            </h2>
          </div>

          <div className="featured-categories-grid">
            {CATEGORIES.map((cat) => (
              <Link
                key={cat.id}
                to={`/ropa/${cat.slug}`}
                className="category-card"
                style={{
                  position: 'relative',
                  height: '270px',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'flex-end',
                  padding: '1.25rem',
                  textDecoration: 'none',
                  backgroundColor: '#18181B',
                  border: '1px solid #E4E4E7'
                }}
              >
                <SafeImage
                  src={getEditorialImg(`category_${cat.id}`, cat.image)}
                  alt={cat.name}
                  className="category-card-img"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transition: 'transform 450ms cubic-bezier(0.16, 1, 0.3, 1), filter 450ms ease'
                  }}
                />
                <div
                  className="category-card-overlay"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(to top, rgba(9,9,11,0.88) 0%, rgba(9,9,11,0.25) 55%, transparent 100%)',
                    transition: 'background 350ms ease'
                  }}
                />
                <div
                  className="category-card-content"
                  style={{
                    position: 'relative',
                    zIndex: 10,
                    color: '#FFFFFF',
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'transform 300ms ease'
                  }}
                >
                  <h3 style={{ fontSize: '1.08rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                    {cat.name}
                  </h3>
                  <ChevronRight size={18} className="category-card-arrow" style={{ transition: 'transform 300ms ease, color 300ms ease, opacity 300ms ease', opacity: 0.85 }} />
                </div>
              </Link>
            ))}
          </div>
        </div>

        <style>{`
          .featured-categories-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 1.25rem;
          }
          .category-card {
            cursor: pointer;
            transition: border-color 300ms ease, box-shadow 300ms ease;
          }
          .category-card:hover {
            border-color: rgba(212, 175, 55, 0.45) !important;
          }
          .category-card:hover .category-card-img {
            transform: scale(1.03);
            filter: brightness(1.04) contrast(1.03);
          }
          .category-card:hover .category-card-content {
            transform: translateY(-3px);
          }
          .category-card:hover .category-card-arrow {
            transform: translateX(4px);
            opacity: 1;
            color: #D4AF37 !important;
          }
          @media (max-width: 1024px) {
            .featured-categories-grid {
              grid-template-columns: repeat(2, 1fr);
              gap: 1.1rem;
            }
          }
          @media (max-width: 640px) {
            .featured-categories-grid {
              grid-template-columns: repeat(2, 1fr);
              gap: 0.85rem;
            }
            .category-card {
              height: 210px !important;
              padding: 0.95rem !important;
            }
            .category-card h3 {
              font-size: 0.92rem !important;
            }
          }
        `}</style>
      </section>

      {/* 5. COMPRA POR OCASIÓN */}
      <section style={{ padding: '80px 0', backgroundColor: '#FFFFFF' }}>
        <div className="jm-container">
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <span
              style={{
                fontSize: '0.70rem',
                fontWeight: 800,
                letterSpacing: '0.20em',
                color: '#D4AF37',
                textTransform: 'uppercase',
                display: 'inline-block',
                marginBottom: '15px'
              }}
            >
              SELECCIÓN POR OCASIÓN
            </span>
            <h2
              style={{
                fontSize: 'clamp(1.5rem, 2.3vw, 1.95rem)',
                fontWeight: 900,
                color: '#09090B',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                margin: 0
              }}
            >
              COMPRA POR OCASIÓN
            </h2>
          </div>

          <div className="occasions-grid">
            {OCCASIONS.map((occ) => {
              const occKey = occ.id === 'trabajo' ? 'occasion_trabajo_oficina'
                : occ.id === 'cita' ? 'occasion_cita_salidas'
                : occ.id === 'casual' ? 'occasion_casual_urbano'
                : occ.id === 'fiesta' ? 'occasion_noche_eventos'
                : occ.id === 'fin-de-semana' ? 'occasion_fin_semana'
                : 'occasion_streetwear';

              return (
                <Link
                  key={occ.id}
                  to={`/colecciones?ocasion=${occ.id}`}
                  className="occasion-card"
                  style={{
                    position: 'relative',
                    height: '270px',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    padding: '1.35rem',
                    textDecoration: 'none',
                    backgroundColor: '#18181B',
                    border: '1px solid #E4E4E7'
                  }}
                >
                  <SafeImage
                    src={getEditorialImg(occKey, occ.image)}
                    alt={occ.name}
                    className="occasion-card-img"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transition: 'transform 400ms cubic-bezier(0.16, 1, 0.3, 1), filter 400ms ease'
                    }}
                  />
                  <div
                    className="occasion-card-overlay"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(to top, rgba(9,9,11,0.92) 0%, rgba(9,9,11,0.30) 55%, transparent 100%)',
                      transition: 'background 350ms ease'
                    }}
                  />
                  <div
                    className="occasion-card-content"
                    style={{
                      position: 'relative',
                      zIndex: 10,
                      color: '#FFFFFF',
                      width: '100%',
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'space-between',
                      transition: 'transform 300ms ease'
                    }}
                  >
                    <div>
                      <h3 style={{ fontSize: '1.10rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
                        {occ.name}
                      </h3>
                      <p style={{ fontSize: '0.80rem', color: '#E4E4E7', marginTop: '0.3rem', fontWeight: 400, margin: '0.3rem 0 0 0' }}>
                        "{occ.subtitle}"
                      </p>
                    </div>
                    <ChevronRight size={19} className="occasion-card-arrow" style={{ transition: 'transform 300ms ease, color 300ms ease, opacity 300ms ease', opacity: 0.85, flexShrink: 0, marginLeft: '0.5rem' }} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <style>{`
          .occasions-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 22px;
          }
          .occasion-card {
            cursor: pointer;
            transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1), border-color 300ms ease, box-shadow 300ms ease;
          }
          .occasion-card:hover {
            transform: translateY(-4px);
            border-color: rgba(212, 175, 55, 0.45) !important;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.20);
          }
          .occasion-card:hover .occasion-card-img {
            transform: scale(1.03);
            filter: brightness(1.04) contrast(1.03);
          }
          .occasion-card:hover .occasion-card-content {
            transform: translateY(-2px);
          }
          .occasion-card:hover .occasion-card-arrow {
            transform: translateX(4px);
            opacity: 1;
            color: #D4AF37 !important;
          }
          @media (max-width: 1024px) {
            .occasions-grid {
              grid-template-columns: repeat(2, 1fr);
              gap: 20px;
            }
          }
          @media (max-width: 640px) {
            .occasions-grid {
              grid-template-columns: 1fr;
              gap: 16px;
            }
            .occasion-card {
              height: 230px !important;
              padding: 1.15rem !important;
            }
            .occasion-card h3 {
              font-size: 1.02rem !important;
            }
            .occasion-card p {
              font-size: 0.78rem !important;
            }
          }
        `}</style>
      </section>

      {/* 6. MÁS VENDIDOS */}
      <section style={{ padding: '4rem 0', backgroundColor: '#FAFAFA' }}>
        <div className="jm-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.15em', color: '#71717A', textTransform: 'uppercase' }}>
                PRENDAS FAVORITAS
              </span>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', marginTop: '0.2rem' }}>
                MÁS VENDIDOS
              </h2>
            </div>
            <Link to="/mas-vendidos" style={{ fontSize: '0.85rem', fontWeight: 700, color: '#09090B', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              VER TODOS <ChevronRight size={18} />
            </Link>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
            gap: '1.5rem'
          }}>
            {bestSellerProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>

      {/* 7. COMPLETA EL LOOK EDITORIAL */}
      <section style={{ padding: '2rem 0' }}>
        <div className="jm-container">
          <CompleteTheLook lookId="look-1" />
        </div>
      </section>

      {/* 8. BENEFICIOS J&M FASHION STORE */}
      <section style={{ padding: '3rem 0', backgroundColor: '#FFFFFF', borderTop: '1px solid #E4E4E7', borderBottom: '1px solid #E4E4E7' }}>
        <div className="jm-container">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '2.5rem',
            textAlign: 'center',
            alignItems: 'start'
          }}>
            <div style={{ padding: '0.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#FAFAFA', border: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                <Truck size={24} color="#09090B" />
              </div>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>
                ENVÍOS A TODO COLOMBIA
              </h4>
              <p style={{ fontSize: '0.80rem', color: '#71717A', lineHeight: 1.5, margin: 0, maxWidth: '240px' }}>
                Despachos rápidos y seguros a ciudades principales y municipios.
              </p>
            </div>

            <div style={{ padding: '0.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#FAFAFA', border: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                <RefreshCw size={24} color="#09090B" />
              </div>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>
                CAMBIOS FÁCILES
              </h4>
              <p style={{ fontSize: '0.80rem', color: '#71717A', lineHeight: 1.5, margin: 0, maxWidth: '240px' }}>
                Solicita cambios de talla o prenda sin trámites molestos.
              </p>
            </div>

            <div style={{ padding: '0.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#FAFAFA', border: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                <ShieldCheck size={24} color="#09090B" />
              </div>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>
                PAGO SEGURO
              </h4>
              <p style={{ fontSize: '0.80rem', color: '#71717A', lineHeight: 1.5, margin: 0, maxWidth: '240px' }}>
                Transacciones protegidas con tarjeta, PSE o transferencia.
              </p>
            </div>

            <div style={{ padding: '0.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#FAFAFA', border: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                <Headphones size={24} color="#09090B" />
              </div>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>
                ATENCIÓN PERSONALIZADA
              </h4>
              <p style={{ fontSize: '0.80rem', color: '#71717A', lineHeight: 1.5, margin: 0, maxWidth: '240px' }}>
                Asesoría de estilo y fit directamente por WhatsApp.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 9. ÚNETE AL CLUB J&M */}
      <section style={{ padding: '3.25rem 0', backgroundColor: '#FAFAFA' }}>
        <div className="jm-container" style={{ textAlign: 'center', maxWidth: '580px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#FFFFFF', border: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
            <Mail size={22} color="#09090B" />
          </div>

          <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.18em', color: '#D4AF37', textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
            10% OFF EN TU PRIMERA COMPRA
          </span>

          <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '0.4rem' }}>
            ÚNETE AL CLUB J&M
          </h2>

          <p style={{ fontSize: '0.85rem', color: '#71717A', marginBottom: '1.75rem', lineHeight: 1.5 }}>
            Recibe novedades, lanzamientos y beneficios exclusivos de J&M.
          </p>

          {newsletterSubscribed ? (
            <div style={{ backgroundColor: '#D1FAE5', color: '#065F46', padding: '0.9rem 1.2rem', borderRadius: '6px', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', border: '1px solid #A7F3D0' }}>
              <Check size={18} /> ¡Gracias por suscribirte! Revisa tu correo para tu beneficio.
            </div>
          ) : (
            <form onSubmit={handleNewsletterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input
                  type="email"
                  required
                  placeholder="Tu correo electrónico"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: '240px',
                    padding: '0.85rem 1.1rem',
                    border: '1px solid #D4D4D8',
                    borderRadius: '6px',
                    fontSize: '0.88rem',
                    outline: 'none',
                    backgroundColor: '#FFFFFF'
                  }}
                />
                <button
                  type="submit"
                  style={{
                    backgroundColor: '#09090B',
                    color: '#FFFFFF',
                    padding: '0.85rem 1.8rem',
                    borderRadius: '6px',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    border: 'none',
                    transition: 'background-color 0.2s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#27272A')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#09090B')}
                >
                  QUIERO MI 10% OFF
                </button>
              </div>

              <span style={{ fontSize: '0.72rem', color: '#A1A1AA', fontWeight: 500, marginTop: '0.2rem' }}>
                Sin spam. Solo novedades y beneficios J&M.
              </span>
            </form>
          )}
        </div>
      </section>
    </div>
  );
};

export default HomePage;
