import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
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
} from '../components/Common/icons';
import { formatCOP } from '../utils/currency';
import supabase from '../config/supabase';
import { useECommerceStore } from '../store/eCommerceStore';
import { useShippingPolicy } from '../hooks/useShippingPolicy';
import ProductCard from '../components/Product/ProductCard';
import ProductReviewForm from '../components/Product/ProductReviewForm';
import SafeProductImage from '../components/Common/SafeImage';

import { analyticsService } from '../services/analytics';
import { isOneSize, sizeHelpFor } from '../utils/sizeAdvice';
import { DialogPanel } from '../components/Common/DialogPanel';

export const ProductDetailPage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const {
    products,
    loadProducts,
    productsLoaded,
    isLoadingProducts,
    productsError,
    addItem,
    toggleWishlist,
    isInWishlist,
    openFitGuide,
    openSizeGuide,
    openSizeRecommender,
    recommendedSize,
    clearRecommendedSize
  } = useECommerceStore();
  const shippingPolicy = useShippingPolicy();

  useEffect(() => {
    if (!productsLoaded && loadProducts) {
      loadProducts();
    }
  }, [productsLoaded, loadProducts]);

  // M27: nunca se muestra otro producto en lugar del pedido (antes: products[0] como respaldo).
  const product = products.find((p) => p.slug === slug) || null;
  const inWishlist = isInWishlist(product?.id);

  // Local Component States
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedColor, setSelectedColor] = useState(product?.colors?.[0] || null);
  const [selectedSize, setSelectedSize] = useState(null); // null by default to enforce selection
  const [sizeError, setSizeError] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [addedFeedback, setAddedFeedback] = useState(false);
  const [cartError, setCartError] = useState(null);
  const [reviews, setReviews] = useState([]);
  const { hash } = useLocation();

  // Variantes reales: disponibilidad por talla para el color elegido
  const variantsForColor = (product?.rawVariants ?? []).filter((v) => v.color === selectedColor?.name);
  const variantFor = (size) => variantsForColor.find((v) => v.size === size) ?? null;
  const selectedVariant = selectedSize ? variantFor(selectedSize) : null;
  const maxQty = selectedVariant?.available ?? 0;
  const colorImages = [...(product?.imagesByColor?.[selectedColor?.name] ?? []), ...(product?.images ?? [])]
    .filter((v, i, a) => a.indexOf(v) === i);
  const galleryProduct = product ? { ...product, images: colorImages.length ? colorImages : product.images } : null;

  // Reseñas aprobadas (RLS: solo status = approved para el público)
  useEffect(() => {
    if (!product?.id) return undefined;
    let alive = true;
    supabase.from('product_reviews').select('id, author_name, city, rating, title, comment, created_at, is_verified_buyer, admin_reply')
      .eq('product_id', product.id).eq('status', 'approved').order('created_at', { ascending: false }).limit(12)
      .then(({ data }) => { if (alive) setReviews(data ?? []); });
    return () => { alive = false; };
  }, [product?.id]);

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
      setSelectedColor(product.colors?.[0] || null);
      setSelectedSize(null);
      setCartError(null);
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
          availability: product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
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

  // Desde «Opina sobre tus compras» (Mis pedidos) se llega con #opiniones: ir directo a la sección
  // (corre después del desplazamiento al inicio del efecto anterior).
  useEffect(() => {
    if (!product?.id || hash !== '#opiniones') return;
    const el = document.getElementById('opiniones');
    if (el?.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [product?.id, hash]);

  // Talla única (accesorios): no hay nada que elegir; se preselecciona si hay stock en el color elegido.
  const oneSize = isOneSize(product);
  useEffect(() => {
    if (!oneSize || !product?.sizes?.length) return;
    const only = product.sizes[0];
    const v = (product.rawVariants ?? []).find((x) => x.size === only && x.color === selectedColor?.name);
    if (v && v.available > 0) setSelectedSize(only);
  }, [oneSize, product, selectedColor?.name]);

  // «Usar talla X» desde «Encuentra tu talla»: se aplica a este producto; si la talla está agotada en el
  // color elegido, se cambia al primer color que la tenga disponible.
  useEffect(() => {
    if (!recommendedSize || !product || recommendedSize.productId !== product.id) return;
    const { size } = recommendedSize;
    clearRecommendedSize?.();
    const inColor = (product.rawVariants ?? []).find((v) => v.size === size && v.color === selectedColor?.name);
    if (!inColor || inColor.available <= 0) {
      const other = (product.rawVariants ?? []).find((v) => v.size === size && v.available > 0);
      const color = other && product.colors?.find((c) => c.name === other.color);
      if (!color) return;
      setSelectedColor(color);
      setSelectedImage(0);
    }
    setSelectedSize(size);
    setSizeError(false);
    setCartError(null);
    setQuantity(1);
  }, [recommendedSize, product, selectedColor?.name, clearRecommendedSize]);

  const sizeHelp = sizeHelpFor(product);

  const toggleAccordion = (key) => {
    setOpenAccordions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const tryAdd = () => {
    if (!product) return false;
    if (!selectedSize || !selectedVariant) {
      setSizeError(true);
      const sizeEl = document.getElementById('size-selector-container');
      if (sizeEl) sizeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    setSizeError(false);
    const r = addItem(product, selectedSize, selectedColor, quantity);
    if (!r.ok) { setCartError(r.message); return false; }
    setCartError(null);
    return true;
  };

  const handleAddToCart = () => {
    if (!tryAdd()) return;
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 2000);
  };

  const handleBuyNow = () => {
    if (tryAdd()) navigate('/checkout');
  };

  const relatedProducts = products.filter((p) => p.category === product?.category && p.id !== product?.id).slice(0, 4);

  if (!product) {
    const msg = productsError ? productsError : (isLoadingProducts || !productsLoaded) ? 'Cargando producto…' : 'Este producto no existe o ya no está disponible.';
    return (
      <div className="jm-container" style={{ padding: '5rem 0', textAlign: 'center' }} role={productsError ? 'alert' : 'status'}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 900, marginBottom: '1rem' }}>{msg}</h1>
        {productsLoaded || productsError ? <Link to="/ropa" style={{ textDecoration: 'underline', fontWeight: 700 }}>Ver el catálogo</Link> : null}
      </div>
    );
  }

  const currentImage = product.images?.[selectedImage] || product.images?.[0];

  return (
    <div style={{ backgroundColor: '#FFFFFF', padding: '2rem 0 5rem 0' }}>
      <div className="jm-container">
        {/* BREADCRUMB */}
        <div className="jm-breadcrumb" style={{ fontSize: '0.8rem', color: '#71717A', marginBottom: '1.5rem' }}>
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
              {galleryProduct.images?.map((img, idx) => (
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
              role="button"
              tabIndex={0}
              aria-label={`Ampliar imagen de ${product.name}`}
              onClick={() => setIsZoomOpen(true)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsZoomOpen(true); } }}
              style={{ flex: 1, position: 'relative', borderRadius: '10px', overflow: 'hidden', aspectRatio: '3/4', cursor: 'zoom-in', backgroundColor: '#F4F4F5' }}
            >
              <SafeProductImage
                product={galleryProduct}
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
                className="jm-tap"
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
                    onClick={() => { setSelectedColor(c); setSelectedImage(0); setSelectedSize(null); setQuantity(1); setCartError(null); }}
                    title={c.name}
                    aria-label={`Color ${c.name}`}
                    aria-pressed={selectedColor?.name === c.name}
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
                  {oneSize ? 'TALLA ÚNICA' : 'SELECCIONA TU TALLA *'}
                </span>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  {sizeHelp.recommender && (
                    <button
                      onClick={() => openSizeRecommender(product)}
                      className="jm-tap"
                      style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent-gold-text)', display: 'flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer' }}
                    >
                      <Sparkles size={14} /> Encuentra tu talla
                    </button>
                  )}
                  {sizeHelp.guide && (
                    <button
                      onClick={() => openSizeGuide(product.category, product.sizeGroup)}
                      className="jm-tap"
                      style={{ fontSize: '0.78rem', fontWeight: 700, color: '#71717A', display: 'flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer' }}
                    >
                      <Ruler size={14} /> Guía de medidas
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {product.sizes?.map((sz) => {
                  const v = variantFor(sz);
                  const soldOut = !v || v.available <= 0;
                  const isSelected = selectedSize === sz;
                  return (
                    <button
                      key={sz}
                      disabled={soldOut}
                      aria-pressed={isSelected}
                      aria-label={soldOut ? `Talla ${sz} agotada` : `Talla ${sz}`}
                      title={soldOut ? 'Agotada en este color' : v.available <= 3 ? `Últimas ${v.available} unidades` : undefined}
                      onClick={() => { setSelectedSize(sz); setSizeError(false); setCartError(null); setQuantity(1); }}
                      style={{
                        minWidth: '52px',
                        height: '44px',
                        fontSize: '0.88rem',
                        fontWeight: 800,
                        borderRadius: '6px',
                        border: isSelected ? '2px solid #09090B' : sizeError ? '1px solid #E11D48' : '1px solid #E4E4E7',
                        backgroundColor: isSelected ? '#09090B' : soldOut ? '#F4F4F5' : '#FFFFFF',
                        color: isSelected ? '#FFFFFF' : soldOut ? '#A1A1AA' : '#09090B',
                        textDecoration: soldOut ? 'line-through' : 'none',
                        cursor: soldOut ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      {sz}
                    </button>
                  );
                })}
              </div>
              {!product.inStock && (
                <div role="status" style={{ fontSize: '0.85rem', color: '#E11D48', fontWeight: 800, marginTop: '0.5rem' }}>Producto agotado</div>
              )}
              {selectedVariant && selectedVariant.available <= 3 && (
                <div style={{ fontSize: '0.78rem', color: '#B45309', fontWeight: 700, marginTop: '0.4rem' }}>
                  ¡Últimas {selectedVariant.available} unidad(es) en esta talla!
                </div>
              )}

              {sizeError && (
                <div style={{ fontSize: '0.78rem', color: '#E11D48', fontWeight: 700, marginTop: '0.4rem' }}>
                  Por favor selecciona una talla antes de agregar al carrito.
                </div>
              )}
            </div>

            {cartError && (
              <div role="alert" style={{ fontSize: '0.82rem', color: '#E11D48', fontWeight: 700 }}>{cartError}</div>
            )}
            {/* QUANTITY & BUY BUTTONS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.4rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {/* Quantity Counter */}
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #E4E4E7', borderRadius: '6px', backgroundColor: '#FAFAFA' }}>
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    aria-label="Disminuir cantidad"
                    style={{ padding: '0.8rem 1rem', color: '#09090B', cursor: 'pointer' }}
                  >
                    <Minus size={15} />
                  </button>
                  <span style={{ fontWeight: 800, fontSize: '0.95rem', padding: '0 0.5rem' }}>{quantity}</span>
                  <button
                    onClick={() => setQuantity(Math.min(Math.max(1, maxQty), quantity + 1))}
                    disabled={!selectedVariant || quantity >= maxQty}
                    aria-label="Aumentar cantidad"
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
                  aria-label={inWishlist ? 'Quitar de favoritos' : 'Guardar en favoritos'}
                  aria-pressed={inWishlist}
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
                  {shippingPolicy.thresholdLabel && <li><strong>Envío GRATIS:</strong> Por compras iguales o superiores a {shippingPolicy.thresholdLabel}.</li>}
                  <li><strong>Bogotá y Medellín:</strong> Entrega en 1 a 2 días hábiles.</li>
                  <li><strong>Resto de Colombia:</strong> Entrega en 2 a 4 días hábiles.</li>
                  <li><strong>Política de Cambios:</strong> Dispones de 30 días para solicitar cambios de talla o prenda.</li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* COMPLETE THE LOOK SECTION */}

        {/* REVIEWS SECTION — reseñas aprobadas de la BD */}
        <section id="opiniones" style={{ margin: '4rem 0', padding: '2.5rem 0', borderTop: '1px solid #E4E4E7', scrollMarginTop: '5rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '0.4rem' }}>OPINIONES DE CLIENTES</h2>
          {product.rating ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem' }}>
              <Star size={16} fill="#D4AF37" color="#D4AF37" />
              <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>{product.rating} de 5</span>
              <span style={{ color: '#71717A', fontSize: '0.85rem' }}>({product.reviewCount} opiniones)</span>
            </div>
          ) : (
            <p style={{ color: '#71717A', fontSize: '0.9rem', marginBottom: '1rem' }}>Este producto todavía no tiene opiniones.</p>
          )}
          <ProductReviewForm productId={product.id} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {reviews.map((rev) => (
              <div key={rev.id} style={{ border: '1px solid #E4E4E7', padding: '1.5rem', borderRadius: '8px', backgroundColor: '#FAFAFA' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{rev.author_name}{rev.city ? ` (${rev.city})` : ''}</div>
                  <span style={{ fontSize: '0.75rem', color: '#71717A' }}>{new Date(rev.created_at).toLocaleDateString('es-CO')}</span>
                </div>
                <div style={{ display: 'flex', gap: '2px', marginBottom: '0.5rem' }} aria-label={`${rev.rating} de 5`}>
                  {[...Array(rev.rating)].map((_, i) => (<Star key={i} size={14} fill="#D4AF37" color="#D4AF37" />))}
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.4rem', color: '#09090B' }}>{rev.title}</div>
                <p style={{ fontSize: '0.82rem', color: '#71717A', lineHeight: 1.5 }}>"{rev.comment}"</p>
                {rev.is_verified_buyer && <div style={{ fontSize: '0.72rem', color: '#10B981', fontWeight: 700, marginTop: '0.4rem' }}>Compra verificada</div>}
                {rev.admin_reply && String(rev.admin_reply).trim() && (
                  <div role="note" aria-label="Respuesta de J&M" style={{ marginTop: '0.75rem', padding: '0.6rem 0.75rem', borderLeft: '3px solid #09090B', backgroundColor: '#F4F4F5', borderRadius: 4 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: '#09090B', marginBottom: '0.2rem' }}>Respuesta de J&M</div>
                    <p style={{ fontSize: '0.8rem', color: '#3F3F46', lineHeight: 1.5, margin: 0 }}>{String(rev.admin_reply).trim()}</p>
                  </div>
                )}
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
        <DialogPanel onClose={() => setIsZoomOpen(false)} aria-label="Imagen ampliada" className="modal-overlay" style={{ backgroundColor: 'rgba(9, 9, 11, 0.95)', zIndex: 200 }} onClick={() => setIsZoomOpen(false)}>
          <button type="button" aria-label="Cerrar" onClick={() => setIsZoomOpen(false)} style={{ position: 'absolute', top: '20px', right: '20px', color: '#FFFFFF', padding: '0.5rem', cursor: 'pointer' }}>
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
        </DialogPanel>
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
