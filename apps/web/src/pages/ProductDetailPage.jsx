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
  MessageCircle
} from 'lucide-react';
import { REVIEWS, formatCOP } from '../data/mockData';
import { useECommerceStore } from '../store/eCommerceStore';
import CompleteTheLook from '../components/Product/CompleteTheLook';
import ProductCard from '../components/Product/ProductCard';

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
  const [selectedSize, setSelectedSize] = useState(product?.sizes?.[0] || 'M');
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState('descripcion');

  // Reset state and scroll to top when slug changes
  useEffect(() => {
    if (product) {
      setSelectedImage(0);
      setSelectedColor(product.colors?.[0] || { name: 'Único', hex: '#000000' });
      setSelectedSize(product.sizes?.[0] || 'M');
      setQuantity(1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [slug, product]);

  const handleAddToCart = () => {
    if (product) {
      addItem(product, selectedSize, selectedColor, quantity);
    }
  };

  const handleBuyNow = () => {
    if (product) {
      addItem(product, selectedSize, selectedColor, quantity);
      navigate('/checkout');
    }
  };

  const relatedProducts = products.filter((p) => p.category === product?.category && p.id !== product?.id).slice(0, 4);

  if (!product) return null;

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
                    width: '65px',
                    height: '80px',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    border: selectedImage === idx ? '2px solid #09090B' : '1px solid #E4E4E7',
                    padding: 0,
                    cursor: 'pointer'
                  }}
                >
                  <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>
              ))}
            </div>

            {/* Main Featured Photo */}
            <div style={{ flex: 1, position: 'relative', borderRadius: '10px', overflow: 'hidden', aspectRatio: '3/4' }}>
              <img
                src={product.images?.[selectedImage] || product.images?.[0]}
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
            </div>
          </div>

          {/* DETAILS & BUYING ACTION COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Title & Ratings */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#71717A', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  J&M FASHION STORE
                </span>
                {product.rating && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Star size={14} fill="#D4AF37" color="#D4AF37" />
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#09090B' }}>{product.rating}</span>
                    <span style={{ fontSize: '0.78rem', color: '#71717A' }}>({product.reviewCount} reseñas)</span>
                  </div>
                )}
              </div>

              <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', lineHeight: 1.2, letterSpacing: '0.02em' }}>
                {product.name}
              </h1>
            </div>

            {/* Pricing */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', borderBottom: '1px solid #F4F4F5', paddingBottom: '1rem' }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B' }}>
                {formatCOP(product.price)}
              </span>
              {product.originalPrice && (
                <>
                  <span style={{ fontSize: '1.1rem', color: '#A1A1AA', textDecoration: 'line-through' }}>
                    {formatCOP(product.originalPrice)}
                  </span>
                  <span style={{ backgroundColor: '#E11D48', color: '#FFFFFF', fontSize: '0.75rem', fontWeight: 800, padding: '3px 8px', borderRadius: '4px' }}>
                    AHORRAS {formatCOP(product.originalPrice - product.price)} ({product.discountPercent}%)
                  </span>
                </>
              )}
            </div>

            {/* FIT BADGE & GUIDE LINK */}
            <div style={{ backgroundColor: '#FAFAFA', padding: '0.9rem 1.1rem', borderRadius: '8px', border: '1px solid #E4E4E7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#71717A', fontWeight: 600, display: 'block' }}>CORTE DE PRENDA</span>
                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#09090B' }}>FIT: {product.fit}</span>
              </div>
              <button
                onClick={openFitGuide}
                style={{ fontSize: '0.8rem', fontWeight: 700, color: '#09090B', textDecoration: 'underline' }}
              >
                ¿Qué significa el Fit?
              </button>
            </div>

            {/* COLOR SELECTOR */}
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.6rem' }}>
                COLOR: <span style={{ fontWeight: 500, color: '#71717A' }}>{selectedColor?.name}</span>
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

            {/* SIZE SELECTOR WITH GUIDE TRIGGERS */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>SELECCIONA TU TALLA</span>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    onClick={() => openSizeRecommender(product)}
                    style={{ fontSize: '0.78rem', fontWeight: 700, color: '#D4AF37', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                  >
                    <Sparkles size={14} /> Encuentra tu talla
                  </button>
                  <button
                    onClick={() => openSizeGuide(product.category)}
                    style={{ fontSize: '0.78rem', fontWeight: 700, color: '#71717A', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                  >
                    <Ruler size={14} /> Guía de medidas
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {product.sizes?.map((sz) => (
                  <button
                    key={sz}
                    onClick={() => setSelectedSize(sz)}
                    style={{
                      minWidth: '50px',
                      height: '44px',
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      borderRadius: '6px',
                      border: selectedSize === sz ? '2px solid #09090B' : '1px solid #E4E4E7',
                      backgroundColor: selectedSize === sz ? '#09090B' : '#FFFFFF',
                      color: selectedSize === sz ? '#FFFFFF' : '#09090B',
                      transition: 'all 0.15s'
                    }}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>

            {/* QUANTITY & BUY BUTTONS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {/* Quantity Selector */}
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #E4E4E7', borderRadius: '6px', backgroundColor: '#FAFAFA' }}>
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    style={{ padding: '0.8rem 1rem', color: '#09090B' }}
                  >
                    <Minus size={16} />
                  </button>
                  <span style={{ fontWeight: 800, fontSize: '0.95rem', padding: '0 0.5rem' }}>{quantity}</span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    style={{ padding: '0.8rem 1rem', color: '#09090B' }}
                  >
                    <Plus size={16} />
                  </button>
                </div>

                {/* Add to Cart */}
                <button
                  onClick={handleAddToCart}
                  style={{
                    flex: 1,
                    backgroundColor: '#09090B',
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
                    gap: '0.6rem'
                  }}
                >
                  <ShoppingBag size={18} /> AGREGAR AL CARRITO
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
                    justifyContent: 'center'
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
                  textTransform: 'uppercase'
                }}
              >
                COMPRAR AHORA DIRECTO
              </button>
            </div>

            {/* TRUST BADGES */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid #F4F4F5' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#27272A', fontWeight: 600 }}>
                <Truck size={18} color="#09090B" /> Envíos a todo Colombia
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#27272A', fontWeight: 600 }}>
                <RotateCcw size={18} color="#09090B" /> Cambios sin costo (30 días)
              </div>
            </div>
          </div>
        </div>

        {/* ACCORDION / TABS SECTION */}
        <div style={{ borderTop: '1px solid #E4E4E7', paddingTop: '2.5rem', marginBottom: '4rem' }}>
          <div style={{ display: 'flex', gap: '2rem', borderBottom: '1px solid #E4E4E7', paddingBottom: '0.75rem', marginBottom: '1.75rem' }}>
            <button
              onClick={() => setActiveTab('descripcion')}
              style={pdpTabBtnStyle(activeTab === 'descripcion')}
            >
              DESCRIPCIÓN
            </button>
            <button
              onClick={() => setActiveTab('detalles')}
              style={pdpTabBtnStyle(activeTab === 'detalles')}
            >
              DETALLES & MATERIALES
            </button>
            <button
              onClick={() => setActiveTab('envio')}
              style={pdpTabBtnStyle(activeTab === 'envio')}
            >
              ENVÍOS & DEVOLUCIONES
            </button>
          </div>

          <div style={{ maxWidth: '800px', lineHeight: 1.7, color: '#27272A', fontSize: '0.95rem' }}>
            {activeTab === 'descripcion' && (
              <div>
                <p style={{ marginBottom: '1rem' }}>{product.description}</p>
                <p style={{ fontSize: '0.88rem', color: '#71717A' }}>
                  <strong>Ajuste recomendado:</strong> {product.fitDescription}
                </p>
              </div>
            )}
            {activeTab === 'detalles' && (
              <ul style={{ paddingLeft: '1.2rem' }}>
                {product.details?.map((item, idx) => (
                  <li key={idx} style={{ marginBottom: '0.4rem' }}>{item}</li>
                ))}
              </ul>
            )}
            {activeTab === 'envio' && (
              <div>
                <p style={{ marginBottom: '0.5rem' }}>
                  Realizamos despachos diarios desde nuestras bodegas principales en Colombia.
                </p>
                <ul style={{ paddingLeft: '1.2rem', fontSize: '0.88rem' }}>
                  <li><strong>Bogotá y Medellín:</strong> 1 a 2 días hábiles.</li>
                  <li><strong>Ciudades Principales (Cali, Barranquilla, Bucaramanga):</strong> 2 a 3 días hábiles.</li>
                  <li><strong>Resto del país:</strong> 3 a 5 días hábiles.</li>
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
              <h2 style={{ fontSize: '1.5rem', fontWeight: 900, textTransform: 'uppercase' }}>RESEÑAS DE CLIENTES</h2>
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
    </div>
  );
};

const pdpTabBtnStyle = (isActive) => ({
  fontSize: '0.88rem',
  fontWeight: 800,
  letterSpacing: '0.08em',
  color: isActive ? '#09090B' : '#71717A',
  borderBottom: isActive ? '2px solid #09090B' : '2px solid transparent',
  paddingBottom: '0.5rem',
  textTransform: 'uppercase',
  transition: 'all 0.15s'
});

export default ProductDetailPage;
