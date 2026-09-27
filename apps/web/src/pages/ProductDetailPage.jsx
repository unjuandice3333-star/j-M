import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Star,
  Heart,
  ShoppingBag,
  Ruler,
  Sparkles,
  Truck,
  RotateCcw,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Check,
  Plus,
  Minus,
  ZoomIn,
  X
} from 'lucide-react';
import { REVIEWS, formatCOP } from '../data/mockData';
import { useECommerceStore } from '../store/eCommerceStore';
import CompleteTheLook from '../components/Product/CompleteTheLook';
import ProductCard from '../components/Product/ProductCard';
import SafeProductImage from '../components/Common/SafeImage';

import { analyticsService } from '../services/analytics';

export const ProductDetailPage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const {
    products,
    addItem,
    toggleWishlist,
    isInWishlist,
    openFitGuide,
    openSizeGuide,
    openSizeRecommender
  } = useECommerceStore();

  const product = products.find((p) => p.slug === slug) || products[0];
  const inWishlist = isInWishlist(product?.id);

  // Local Component States
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedColor, setSelectedColor] = useState(product?.colors?.[0] || { name: 'Único', hex: '#000000' });
  const [selectedSize, setSelectedSize] = useState(null); // null by default to enforce selection
  const [sizeError, setSizeError] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [addedFeedback, setAddedFeedback] = useState(false);

  // Accordion open states
  const [openAccordions, setOpenAccordions] = useState({
    descripcion: true,
    materiales: false,
    envios: false
  });

  // Reset state, track analytics and inject JSON-LD Product Schema
  useEffect(() => {
    if (product) {
      setSelectedImage(0);
      setSelectedColor(product.colors?.[0] || { name: 'Único', hex: '#000000' });
      setSelectedSize(product.sizes?.[0] || null);
      setSizeError(false);
      setQuantity(1);
      setAddedFeedback(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // GA4 & Meta Pixel View Item
      analyticsService.viewItem(product);

      // JSON-LD Product Schema for Google Search
      const schemaData = {
        '@context': 'https://schema.org/',
        '@type': 'Product',
        name: product.name,
        image: product.images || [],
        description: product.description || 'Prenda masculina premium confeccionada en Colombia por J&M Fashion Store.',
        sku: product.slug || product.id,
        brand: {
          '@type': 'Brand',
          name: 'J&M Fashion Store'
        },
        offers: {
          '@type': 'Offer',
          url: window.location.href,
          priceCurrency: 'COP',
          price: product.price,
          availability: 'https://schema.org/InStock',
          itemCondition: 'https://schema.org/NewCondition'
        }
      };

      const scriptId = 'jsonld-product-schema';
      let existingScript = document.getElementById(scriptId);
      if (!existingScript) {
        existingScript = document.createElement('script');
        existingScript.id = scriptId;
        existingScript.type = 'application/ld+json';
        document.head.appendChild(existingScript);
      }
      existingScript.textContent = JSON.stringify(schemaData);

      return () => {
        const scriptToRemove = document.getElementById(scriptId);
        if (scriptToRemove) scriptToRemove.remove();
      };
    }
  }, [slug, product]);

  const toggleAccordion = (key) => {
    setOpenAccordions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAddToCart = () => {
    if (!product) return;
    if (product.sizes?.length > 0 && !selectedSize) {
      setSizeError(true);
      const sizeEl = document.getElementById('size-selector-container');
      if (sizeEl) sizeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSizeError(false);
    addItem(product, selectedSize || product.sizes?.[0] || 'M', selectedColor, quantity);
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 2000);
  };

  const handleBuyNow = () => {
    if (!product) return;
    if (product.sizes?.length > 0 && !selectedSize) {
      setSizeError(true);
      return;
    }
    addItem(product, selectedSize || product.sizes?.[0] || 'M', selectedColor, quantity);
    navigate('/checkout');
  };

  const relatedProducts = products.filter((p) => p.category === product?.category && p.id !== product?.id).slice(0, 4);

  if (!product) return null;

  const currentImage = product.images?.[selectedImage] || product.images?.[0];

  return (
    <div style={{ backgroundColor: '#FFFFFF', padding: '2rem 0 5rem 0' }}>
      <div className="jm-container">
        {/* BREADCRUMB */}
        <div style={{ fontSize: '0.8rem', color: '#71717A', marginBottom: '1.5rem' }}>
          <Link to="/" style={{ color: '#71717A' }}>Inicio</Link>
          <span style={{ margin: '0 0.4rem' }}>/</span>
          <Link to={`/ropa/${product.category}`} style={{ color: '#71717A', textTransform: 'capitalize' }}>
            {product.category}
          </Link>
          <span style={{ margin: '0 0.4rem' }}>/</span>
          <strong style={{ color: '#09090B' }}>{product.name}</strong>
        </div>

        {/* TOP SECTION: GALLERY + PRODUCT ACTION BOX */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '3.5rem',
          alignItems: 'flex-start',
          marginBottom: '4rem'
        }}>
          {/* GALLERY COLUMN */}
          <div style={{ display: 'flex', gap: '1rem' }} className="pdp-gallery-wrapper">
            {/* Thumbnails list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {product.images?.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedImage(idx)}
                  style={{
                    width: '68px',
                    height: '84px',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    border: selectedImage === idx ? '2px solid #09090B' : '1px solid #E4E4E7',
                    padding: 0,
                    cursor: 'pointer',
                    backgroundColor: '#F4F4F5'
                  }}
                >
                  <SafeProductImage
                    src={img}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </button>
              ))}
            </div>

            {/* Main Featured Photo with Zoom */}
            <div
              onClick={() => setIsZoomOpen(true)}
              style={{ flex: 1, position: 'relative', borderRadius: '10px', overflow: 'hidden', aspectRatio: '3/4', cursor: 'zoom-in', backgroundColor: '#F4F4F5' }}
            >
              <SafeProductImage
                product={product}
                imageIndex={selectedImage}
                alt={product.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />

              {/* Badges */}
              <div style={{ position: 'absolute', top: '16px', left: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {product.isNew && (
                  <span style={{ backgroundColor: '#09090B', color: '#FFFFFF', fontSize: '0.7rem', fontWeight: 800, padding: '4px 10px', borderRadius: '4px' }}>
                    NUEVO
                  </span>
                )}
                {product.isBestSeller && (
                  <span style={{ backgroundColor: '#D4AF37', color: '#09090B', fontSize: '0.7rem', fontWeight: 800, padding: '4px 10px', borderRadius: '4px' }}>
                    MÁS VENDIDO
                  </span>
                )}
              </div>

              {/* Zoom Trigger Hint */}
              <div style={{
                position: 'absolute',
                bottom: '16px',
                right: '16px',
                backgroundColor: 'rgba(9, 9, 11, 0.75)',
                color: '#FFFFFF',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <ZoomIn size={18} />
              </div>
            </div>
          </div>

          {/* DETAILS & BUYING ACTION COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
            {/* Title & Ratings */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#71717A', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  J&M FASHION STORE
                </span>
                {product.rating && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Star size={14} fill="#D4AF37" color="#D4AF37" />
                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#09090B' }}>{product.rating}</span>
                    <span style={{ fontSize: '0.78rem', color: '#71717A' }}>({product.reviewCount} opiniones)</span>
                  </div>
                )}
              </div>

              <h1 style={{ fontSize: '1.85rem', fontWeight: 900, color: '#09090B', lineHeight: 1.25, letterSpacing: '0.02em' }}>
                {product.name}
              </h1>
            </div>

            {/* Pricing */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', borderBottom: '1px solid #F4F4F5', paddingBottom: '1.25rem' }}>
              <span style={{ fontSize: '1.9rem', fontWeight: 900, color: '#09090B' }}>
                {formatCOP(product.price)}
              </span>
              {product.originalPrice && (
                <>
                  <span style={{ fontSize: '1.1rem', color: '#A1A1AA', textDecoration: 'line-through' }}>
                    {formatCOP(product.originalPrice)}
                  </span>
                  <span style={{ backgroundColor: '#E11D48', color: '#FFFFFF', fontSize: '0.72rem', fontWeight: 800, padding: '3px 8px', borderRadius: '4px' }}>
                    AHORRAS {formatCOP(product.originalPrice - product.price)}
                  </span>
                </>
              )}
            </div>

            {/* FIT BADGE & GUIDE LINK */}
            <div style={{ backgroundColor: '#FAFAFA', padding: '0.85rem 1.1rem', borderRadius: '8px', border: '1px solid #E4E4E7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: '#71717A', fontWeight: 700, display: 'block', textTransform: 'uppercase' }}>CORTE Y SILUETA</span>
                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#09090B' }}>FIT: {product.fit}</span>
              </div>
              <button
                onClick={openFitGuide}
                style={{ fontSize: '0.8rem', fontWeight: 700, color: '#09090B', textDecoration: 'underline', cursor: 'pointer' }}
              >
                ¿Qué significa el Fit?
              </button>
            </div>

            {/* COLOR SELECTOR */}
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                COLOR: <span style={{ fontWeight: 600, color: '#71717A' }}>{selectedColor?.name}</span>
              </div>
              <div style={{ display: 'flex', gap: '0.6rem' }}>
                {product.colors?.map((c, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedColor(c)}
                    title={c.name}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: c.hex,
                      border: selectedColor?.name === c.name ? '2px solid #09090B' : '1px solid #D4D4D8',
                      outline: selectedColor?.name === c.name ? '2px solid #FFFFFF' : 'none',
                      cursor: 'pointer'
                    }}
                  />
                ))}
              </div>
            </div>

            {/* SIZE SELECTOR WITH GUIDE TRIGGERS & VALIDATION */}
            <div id="size-selector-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: sizeError ? '#E11D48' : '#09090B' }}>
                  SELECCIONA TU TALLA *
                </span>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    onClick={() => openSizeRecommender(product)}
                    style={{ fontSize: '0.78rem', fontWeight: 700, color: '#D4AF37', display: 'flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer' }}
                  >
                    <Sparkles size={14} /> Encuentra tu talla
                  </button>
                  <button
                    onClick={() => openSizeGuide(product.category)}
                    style={{ fontSize: '0.78rem', fontWeight: 700, color: '#71717A', display: 'flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer' }}
                  >
                    <Ruler size={14} /> Guía de medidas
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {product.sizes?.map((sz) => {
                  const isSelected = selectedSize === sz;
                  return (
                    <button
                      key={sz}
                      onClick={() => { setSelectedSize(sz); setSizeError(false); }}
                      style={{
                        minWidth: '52px',
                        height: '44px',
                        fontSize: '0.88rem',
                        fontWeight: 800,
                        borderRadius: '6px',
                        border: isSelected ? '2px solid #09090B' : sizeError ? '1px solid #E11D48' : '1px solid #E4E4E7',
                        backgroundColor: isSelected ? '#09090B' : '#FFFFFF',
                        color: isSelected ? '#FFFFFF' : '#09090B',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      {sz}
                    </button>
                  );
                })}
              </div>

              {sizeError && (
                <div style={{ fontSize: '0.78rem', color: '#E11D48', fontWeight: 700, marginTop: '0.4rem' }}>
                  Por favor selecciona una talla antes de agregar al carrito.
                </div>
              )}
            </div>

            {/* QUANTITY & BUY BUTTONS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.4rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {/* Quantity Counter */}
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #E4E4E7', borderRadius: '6px', backgroundColor: '#FAFAFA' }}>
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    style={{ padding: '0.8rem 1rem', color: '#09090B', cursor: 'pointer' }}
                  >
                    <Minus size={15} />
                  </button>
                  <span style={{ fontWeight: 800, fontSize: '0.95rem', padding: '0 0.5rem' }}>{quantity}</span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    style={{ padding: '0.8rem 1rem', color: '#09090B', cursor: 'pointer' }}
                  >
                    <Plus size={15} />
                  </button>
                </div>

                {/* Add to Cart CTA */}
                <button
                  onClick={handleAddToCart}
                  style={{
                    flex: 1,
                    backgroundColor: addedFeedback ? '#10B981' : '#09090B',
                    color: '#FFFFFF',
                    padding: '0.95rem',
                    borderRadius: '6px',
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.6rem',
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                >
                  {addedFeedback ? (
                    <>
                      <Check size={18} /> ¡AGREGADO AL CARRITO!
                    </>
                  ) : (
                    <>
                      <ShoppingBag size={18} /> AGREGAR AL CARRITO
                    </>
                  )}
                </button>

                {/* Wishlist Button */}
                <button
                  onClick={() => toggleWishlist(product.id)}
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '6px',
                    border: '1px solid #E4E4E7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <Heart size={20} fill={inWishlist ? '#E11D48' : 'none'} color={inWishlist ? '#E11D48' : '#09090B'} />
                </button>
              </div>

              {/* Buy Now Button */}
              <button
                onClick={handleBuyNow}
                style={{
                  width: '100%',
                  backgroundColor: '#27272A',
                  color: '#FFFFFF',
                  padding: '0.95rem',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer'
                }}
              >
                COMPRAR AHORA DIRECTO
              </button>
            </div>

            {/* TRUST BADGES */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid #F4F4F5' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#27272A', fontWeight: 600 }}>
                <Truck size={17} color="#09090B" /> Envíos a todo Colombia
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#27272A', fontWeight: 600 }}>
                <RotateCcw size={17} color="#09090B" /> Cambios fáciles (30 días)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#27272A', fontWeight: 600 }}>
                <ShieldCheck size={17} color="#09090B" /> Compra 100% Segura
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#27272A', fontWeight: 600 }}>
                <Sparkles size={17} color="#09090B" /> Confección Premium
              </div>
            </div>
          </div>
        </div>

        {/* ACCORDIONS SECTION */}
        <div style={{ borderTop: '1px solid #E4E4E7', paddingTop: '2.5rem', marginBottom: '4rem', maxWidth: '860px' }}>
          {/* Accordion 1: Descripción */}
          <div style={{ borderBottom: '1px solid #E4E4E7' }}>
            <button
              onClick={() => toggleAccordion('descripcion')}
              style={accordionHeaderStyle}
            >
              <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>DESCRIPCIÓN DE LA PRENDA</span>
              {openAccordions.descripcion ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            {openAccordions.descripcion && (
              <div style={{ paddingBottom: '1.25rem', color: '#3F3F46', fontSize: '0.92rem', lineHeight: 1.7 }}>
                <p style={{ marginBottom: '0.8rem' }}>{product.description}</p>
                <p style={{ fontSize: '0.88rem', color: '#71717A' }}>
                  <strong>Ajuste y recomendación de fit:</strong> {product.fitDescription}
                </p>
              </div>
            )}
          </div>

          {/* Accordion 2: Materiales y Cuidados */}
          <div style={{ borderBottom: '1px solid #E4E4E7' }}>
            <button
              onClick={() => toggleAccordion('materiales')}
              style={accordionHeaderStyle}
            >
              <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>MATERIALES Y CUIDADOS</span>
              {openAccordions.materiales ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            {openAccordions.materiales && (
              <div style={{ paddingBottom: '1.25rem', color: '#3F3F46', fontSize: '0.9rem', lineHeight: 1.6 }}>
                <ul style={{ paddingLeft: '1.2rem', marginBottom: '0.8rem' }}>
                  {product.details?.map((item, idx) => (
                    <li key={idx} style={{ marginBottom: '0.4rem' }}>{item}</li>
                  ))}
                </ul>
                <div style={{ backgroundColor: '#FAFAFA', padding: '0.85rem', borderRadius: '6px', fontSize: '0.82rem', color: '#71717A' }}>
                  🧼 <strong>Instrucciones de lavado:</strong> Lavar a máquina con agua fría, no usar blanqueador, secar a la sombra y planchar a temperatura media por el revés.
                </div>
              </div>
            )}
          </div>

          {/* Accordion 3: Envíos y Cambios */}
          <div style={{ borderBottom: '1px solid #E4E4E7' }}>
            <button
              onClick={() => toggleAccordion('envios')}
              style={accordionHeaderStyle}
            >
              <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>ENVÍOS, CAMBIOS Y GARANTÍA</span>
              {openAccordions.envios ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            {openAccordions.envios && (
              <div style={{ paddingBottom: '1.25rem', color: '#3F3F46', fontSize: '0.9rem', lineHeight: 1.6 }}>
                <p style={{ marginBottom: '0.5rem' }}>
                  Despachamos directamente desde Colombia a todo el territorio nacional.
                </p>
                <ul style={{ paddingLeft: '1.2rem', fontSize: '0.85rem', color: '#52525B', marginBottom: '0.8rem' }}>
                  <li><strong>Envío GRATIS:</strong> Por compras iguales o superiores a $200.000 COP.</li>
                  <li><strong>Bogotá y Medellín:</strong> Entrega en 1 a 2 días hábiles.</li>
                  <li><strong>Resto de Colombia:</strong> Entrega en 2 a 4 días hábiles.</li>
                  <li><strong>Política de Cambios:</strong> Dispones de 30 días para solicitar cambios de talla o prenda.</li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* COMPLETE THE LOOK SECTION */}
        <CompleteTheLook lookId="look-1" />

        {/* REVIEWS SECTION */}
        <section style={{ margin: '4rem 0', padding: '2.5rem 0', borderTop: '1px solid #E4E4E7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 900, textTransform: 'uppercase' }}>OPINIONES DE CLIENTES</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                <div style={{ display: 'flex' }}>
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={16} fill="#D4AF37" color="#D4AF37" />
                  ))}
                </div>
                <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>4.9 de 5</span>
                <span style={{ color: '#71717A', fontSize: '0.85rem' }}>({REVIEWS.length} opiniones verificadas)</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {REVIEWS.map((rev) => (
              <div key={rev.id} style={{ border: '1px solid #E4E4E7', padding: '1.5rem', borderRadius: '8px', backgroundColor: '#FAFAFA' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{rev.author} ({rev.city})</div>
                  <span style={{ fontSize: '0.75rem', color: '#71717A' }}>{rev.date}</span>
                </div>
                <div style={{ display: 'flex', gap: '2px', marginBottom: '0.5rem' }}>
                  {[...Array(rev.rating)].map((_, i) => (
                    <Star key={i} size={14} fill="#D4AF37" color="#D4AF37" />
                  ))}
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.4rem', color: '#09090B' }}>{rev.title}</div>
                <p style={{ fontSize: '0.82rem', color: '#71717A', lineHeight: 1.5 }}>"{rev.comment}"</p>
              </div>
            ))}
          </div>
        </section>

        {/* RELATED PRODUCTS */}
        {relatedProducts.length > 0 && (
          <section style={{ margin: '4rem 0' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '2rem' }}>
              TAMBIÉN TE PUEDE INTERESAR
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1.5rem' }}>
              {relatedProducts.map((prod) => (
                <ProductCard key={prod.id} product={prod} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* MOBILE STICKY CTA BAR */}
      <div className="mobile-sticky-cta" style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#FFFFFF',
        borderTop: '1px solid #E4E4E7',
        padding: '0.75rem 1rem',
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        boxShadow: '0 -4px 15px rgba(0,0,0,0.08)'
      }}>
        <div>
          <span style={{ fontSize: '0.7rem', color: '#71717A', fontWeight: 600, display: 'block' }}>PRECIO</span>
          <span style={{ fontWeight: 900, fontSize: '1.1rem', color: '#09090B' }}>{formatCOP(product.price)}</span>
        </div>
        <button
          onClick={handleAddToCart}
          style={{
            flex: 1,
            backgroundColor: addedFeedback ? '#10B981' : '#09090B',
            color: '#FFFFFF',
            padding: '0.85rem',
            borderRadius: '6px',
            fontWeight: 800,
            fontSize: '0.85rem',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            border: 'none'
          }}
        >
          {addedFeedback ? <Check size={16} /> : <ShoppingBag size={16} />}
          {addedFeedback ? '¡AGREGADO!' : 'AGREGAR AL CARRITO'}
        </button>
      </div>

      {/* LIGHTBOX ZOOM MODAL */}
      {isZoomOpen && (
        <div className="modal-overlay" style={{ backgroundColor: 'rgba(9, 9, 11, 0.95)', zIndex: 200 }} onClick={() => setIsZoomOpen(false)}>
          <button onClick={() => setIsZoomOpen(false)} style={{ position: 'absolute', top: '20px', right: '20px', color: '#FFFFFF', padding: '0.5rem', cursor: 'pointer' }}>
            <X size={32} />
          </button>
          <img
            src={currentImage}
            alt={product.name}
            onError={(e) => {
              e.currentTarget.src = 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=1000';
            }}
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px' }}
          />
        </div>
      )}

      {/* Responsive Breakpoint CSS for PDP Mobile Sticky Bar */}
      <style>{`
        @media (min-width: 901px) {
          .mobile-sticky-cta { display: none !important; }
        }
      `}</style>
    </div>
  );
};

const accordionHeaderStyle = {
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '1.2rem 0',
  backgroundColor: 'transparent',
  border: 'none',
  color: '#09090B',
  cursor: 'pointer',
  textAlign: 'left'
};

export default ProductDetailPage;
