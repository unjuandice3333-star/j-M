import { describe, it, expect } from 'vitest';
import { getProductImage, hasValidProductImage, normalizeStyleLine, DEFAULT_PRODUCT_FALLBACK } from '../src/utils/productUtils.js';

describe('productUtils', () => {
  it('falls back when no product/images', () => {
    expect(getProductImage(null)).toBe(DEFAULT_PRODUCT_FALLBACK);
    expect(getProductImage({ images: ['', '  '] })).toBe(DEFAULT_PRODUCT_FALLBACK);
  });
  it('picks images by index with fallback to first', () => {
    const p = { images: ['a', 'b'] };
    expect(getProductImage(p, 1)).toBe('b');
    expect(getProductImage(p, 9)).toBe('a');
  });
  it('detects valid images', () => {
    expect(hasValidProductImage({ imageUrl: 'x' })).toBe(true);
    expect(hasValidProductImage({})).toBe(false);
  });
  it('normalizes style lines', () => {
    expect(normalizeStyleLine('Streetwear')).toBe('urbana');
    expect(normalizeStyleLine(undefined)).toBe('todas');
  });
});
