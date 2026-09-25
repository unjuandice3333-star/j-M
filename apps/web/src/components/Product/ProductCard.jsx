import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Star, ShoppingBag, Eye } from 'lucide-react';
import { useECommerceStore } from '../../store/eCommerceStore';
import { formatCOP } from '../../data/mockData';

export const ProductCard = ({ product }) => {
  const { toggleWishlist, isInWishlist, addItem } = useECommerceStore();
  const [isHovered, setIsHovered] = useState(false);
  const [selectedSize, setSelectedSize] = useState(null);
  const inWishlist = isInWishlist(product.id);

  const mainImage = product.images[0];
  const secondImage = product.images[1] || product.images[0];

  const handleQuickAdd = (e, size) => {
    e.preventDefault();
    e.stopPropagation();
    addItem(product, size, product.colors[0], 1);
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        overflow: 'hidden',
        transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s',
        border: '1px solid #F4F4F5'
      }}
    >
      {/* BADGES & WISHLIST OVERLAY */}
      <div style={{
        position: 'absolute',
        top: '12px',
        left: '12px',
        right: '12px',
        zIndex: 10,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        pointerEvents: 'none'
      }}>
        {/* Badges Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {product.isNew && (
            <span style={badgeStyle('#09090B', '#FFFFFF')}>NUEVO</span>
          )}
          {product.isBestSeller && (
            <span style={badgeStyle('#D4AF37', '#09090B')}>MÁS VENDIDO</span>
          )}
          {product.isSale && product.discountPercent > 0 && (
            <span style={badgeStyle('#E11D48', '#FFFFFF')}>-{product.discountPercent}%</span>
          )}
        </div>

        {/* Wishlist Button */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleWishlist(product.id);
          }}
          style={{
            pointerEvents: 'auto',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 10px rgba(0,0,0,0.08)',
            border: 'none',
            cursor: 'pointer',
            transition: 'transform 0.15s'
          }}
          title={inWishlist ? 'Quitar de favoritos' : 'Guardar en favoritos'}
        >
          <Heart size={18} fill={inWishlist ? '#E11D48' : 'none'} color={inWishlist ? '#E11D48' : '#09090B'} />
        </button>
      </div>

      {/* IMAGE CONTAINER WITH HOVER FLIP */}
      <Link to={`/producto/${product.slug}`} style={{ display: 'block', position: 'relative', overflow: 'hidden', aspectRatio: '3/4' }}>
        <img
          src={isHovered ? secondImage : mainImage}
          alt={product.name}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s',
            transform: isHovered ? 'scale(1.04)' : 'scale(1)'
          }}
        />

        {/* FIT BADGE OVERLAY */}
        {product.fit && (
          <div style={{
            position: 'absolute',
            bottom: isHovered ? '50px' : '10px',
            left: '10px',
            backgroundColor: 'rgba(9, 9, 11, 0.85)',
            color: '#FFFFFF',
            fontSize: '0.65rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            padding: '3px 8px',
            borderRadius: '3px',
            transition: 'bottom 0.25s ease'
          }}>
            FIT: {product.fit}
          </div>
        )}

        {/* QUICK ADD SIZES BAR ON HOVER */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(6px)',
          padding: '8px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          transform: isHovered ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          borderTop: '1px solid #E4E4E7'
        }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#71717A', marginRight: '4px' }}>AGREGAR:</span>
          {product.sizes.map((sz) => (
            <button
              key={sz}
              onClick={(e) => handleQuickAdd(e, sz)}
              style={{
                padding: '4px 8px',
                fontSize: '0.72rem',
                fontWeight: 700,
                border: '1px solid #D4D4D8',
                borderRadius: '4px',
                backgroundColor: '#FFFFFF',
                color: '#09090B',
                transition: 'background 0.15s, color 0.15s'
              }}
            >
              {sz}
            </button>
          ))}
        </div>
      </Link>

      {/* CARD INFO CONTENT */}
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
        {/* COLOR SWATCHES & CATEGORY */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {product.category}
          </span>
          {/* Color Dots */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {product.colors.map((c, idx) => (
              <span
                key={idx}
                title={c.name}
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: c.hex,
                  border: c.hex === '#FFFFFF' ? '1px solid #D4D4D8' : 'none'
                }}
              />
            ))}
          </div>
        </div>

        {/* TITLE */}
        <Link to={`/producto/${product.slug}`} style={{ textDecoration: 'none' }}>
          <h3 style={{
            fontSize: '0.92rem',
            fontWeight: 600,
            color: '#09090B',
            lineHeight: 1.3,
            margin: '0.2rem 0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical'
          }}>
            {product.name}
          </h3>
        </Link>

        {/* RATING */}
        {product.rating && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Star size={13} fill="#D4AF37" color="#D4AF37" />
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#09090B' }}>{product.rating}</span>
            <span style={{ fontSize: '0.72rem', color: '#71717A' }}>({product.reviewCount})</span>
          </div>
        )}

        {/* PRICING */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: 'auto', paddingTop: '0.4rem' }}>
          <span style={{ fontSize: '1rem', fontWeight: 800, color: '#09090B' }}>
            {formatCOP(product.price)}
          </span>
          {product.originalPrice && (
            <span style={{ fontSize: '0.8rem', color: '#A1A1AA', textDecoration: 'line-through' }}>
              {formatCOP(product.originalPrice)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

const badgeStyle = (bgColor, textColor) => ({
  backgroundColor: bgColor,
  color: textColor,
  fontSize: '0.62rem',
  fontWeight: 800,
  letterSpacing: '0.08em',
  padding: '3px 7px',
  borderRadius: '3px',
  display: 'inline-block'
});

export default ProductCard;
