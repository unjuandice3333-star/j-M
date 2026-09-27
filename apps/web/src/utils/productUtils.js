// Utilidades centralizadas para gestión de productos e imágenes en J&M Fashion Store

export const DEFAULT_PRODUCT_FALLBACK = 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&q=80&w=1000';

/**
 * Obtiene la imagen principal de un producto de forma segura y estructurada.
 * Evalúa las propiedades images, imageUrl, image, y fallbacks sin depender de URLs manuales.
 */
export const getProductImage = (product, index = 0) => {
  if (!product) return DEFAULT_PRODUCT_FALLBACK;

  let candidates = [];

  if (Array.isArray(product.images) && product.images.length > 0) {
    candidates = product.images.filter((img) => typeof img === 'string' && img.trim() !== '');
  } else if (typeof product.imageUrl === 'string' && product.imageUrl.trim() !== '') {
    candidates.push(product.imageUrl);
  } else if (typeof product.image === 'string' && product.image.trim() !== '') {
    candidates.push(product.image);
  }

  if (candidates.length > 0) {
    const selected = candidates[index] || candidates[0];
    return selected;
  }

  return DEFAULT_PRODUCT_FALLBACK;
};

/**
 * Verifica si un producto posee al menos una imagen válida en su estructura de datos.
 */
export const hasValidProductImage = (product) => {
  if (!product) return false;
  if (Array.isArray(product.images) && product.images.some((img) => typeof img === 'string' && img.trim() !== '')) {
    return true;
  }
  if (typeof product.imageUrl === 'string' && product.imageUrl.trim() !== '') return true;
  if (typeof product.image === 'string' && product.image.trim() !== '') return true;
  return false;
};

/**
 * Normaliza cualquier variante de línea de estilo a su valor canónico único:
 * "urbana" | "elegante" | "casual"
 */
export const normalizeStyleLine = (val) => {
  if (!val || typeof val !== 'string') return 'todas';
  const clean = val.trim().toLowerCase().replace(/_/g, '-');
  if (['urbana', 'urbano', 'urban', 'streetwear'].includes(clean)) return 'urbana';
  if (['elegante', 'formal', 'oficina'].includes(clean)) return 'elegante';
  if (['casual', 'smart-casual', 'smart casual', 'smartcasual'].includes(clean)) return 'casual';
  if (clean === 'todas' || clean === 'todos' || clean === 'all') return 'todas';
  return clean;
};

