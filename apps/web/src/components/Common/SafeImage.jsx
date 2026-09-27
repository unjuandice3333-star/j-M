import React, { useState, useEffect } from 'react';
import { DEFAULT_PRODUCT_FALLBACK, getProductImage } from '../../utils/productUtils';

export const SafeProductImage = ({
  src,
  product,
  imageIndex = 0,
  alt = '',
  fallbackSrc = DEFAULT_PRODUCT_FALLBACK,
  style = {},
  className = '',
  onMouseEnter,
  onMouseLeave,
  onClick,
  objectFit = 'cover',
  ...props
}) => {
  // Determine initial image URL using getProductImage helper if product object provided, else src prop
  const initialSrc = product ? getProductImage(product, imageIndex) : (src || fallbackSrc);

  const [imgSrc, setImgSrc] = useState(initialSrc);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const newSrc = product ? getProductImage(product, imageIndex) : (src || fallbackSrc);
    setImgSrc(newSrc);
    setHasError(false);
    setIsLoading(true);
  }, [src, product, imageIndex, fallbackSrc]);

  const handleError = () => {
    if (!hasError) {
      setHasError(true);
      setIsLoading(false);
      setImgSrc(fallbackSrc);
    }
  };

  const handleLoad = () => {
    setIsLoading(false);
  };

  const altText = alt || product?.name || 'Producto J&M Fashion Store';

  return (
    <div
      style={{
        position: 'relative',
        width: style.width || '100%',
        height: style.height || '100%',
        backgroundColor: isLoading ? '#F4F4F5' : 'transparent',
        overflow: 'hidden',
        display: style.display || 'block',
        borderRadius: style.borderRadius || '0px'
      }}
    >
      <img
        src={imgSrc}
        alt={altText}
        onError={handleError}
        onLoad={handleLoad}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        style={{
          width: '100%',
          height: '100%',
          objectFit: objectFit,
          display: 'block',
          opacity: isLoading ? 0.6 : 1,
          transition: 'opacity 0.25s ease-in-out, transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
          ...style
        }}
        className={className}
        {...props}
      />
    </div>
  );
};

export const SafeImage = SafeProductImage;
export default SafeProductImage;
