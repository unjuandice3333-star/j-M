import { describe, it, expect, vi } from 'vitest';
import { makeSupabaseMock } from './helpers.js';

const supa = makeSupabaseMock();
vi.mock('../config/supabase', () => ({ default: supa, supabase: supa }));

const { normalizeProduct, imageUrl } = await import('../services/productService.js');

const row = (over = {}) => ({
  id: 'p1', reference: 'R1', slug: 'camiseta', name: 'Camiseta', base_price: '80000', compare_at_price: null,
  status: 'active', is_featured_new: true, is_bestseller: false, published_at: null,
  categories: { slug: 'camisetas', name: 'Camisetas', size_group: 'tops' },
  style_lines: null, brands: { name: 'J&M' },
  product_colors: [
    { color_id: 'c2', position: 2, is_default: false, colors: { slug: 'blanco', name: 'Blanco', hex_code: '#fff' } },
    { color_id: 'c1', position: 1, is_default: true, colors: { slug: 'negro', name: 'Negro', hex_code: '#000' } },
  ],
  product_images: [
    { id: 'i2', color_id: 'c2', external_url: 'https://x/blanco.jpg', position: 1 },
    { id: 'i1', color_id: 'c1', external_url: 'https://x/negro.jpg', position: 1 },
    { id: 'i0', color_id: null, external_url: 'https://x/general.jpg', position: 1 },
  ],
  variants: [
    { id: 'v-l', sku: 'L-NEG', color_id: 'c1', price_override: null, is_active: true, sizes: { code: 'L', sort_order: 2 } },
    { id: 'v-m', sku: 'M-NEG', color_id: 'c1', price_override: '85000', is_active: true, sizes: { code: 'M', sort_order: 1 } },
    { id: 'v-x', sku: 'X-BLA', color_id: 'c2', price_override: null, is_active: false, sizes: { code: 'XL', sort_order: 3 } },
  ],
  product_occasions: [],
  ...over,
});

describe('productService.normalizeProduct', () => {
  it('ordena tallas, usa el precio de la variante y descarta variantes inactivas', () => {
    const p = normalizeProduct(row(), new Map([['v-m', 4], ['v-l', 0], ['v-x', 9]]));
    expect(p.rawVariants.map((v) => v.size)).toEqual(['M', 'L']);
    expect(p.rawVariants[0].price).toBe(85000);
    expect(p.rawVariants[1].price).toBe(80000);
    expect(p.sizes).toEqual(['M', 'L']);
    expect(p.stock).toBe(4);
    expect(p.inStock).toBe(true);
  });

  it('sin disponibilidad conocida el stock es 0 y no está en stock', () => {
    const p = normalizeProduct(row());
    expect(p.stock).toBe(0);
    expect(p.inStock).toBe(false);
  });

  it('el color por defecto va primero y sus imágenes encabezan la galería', () => {
    const p = normalizeProduct(row());
    expect(p.color).toBe('Negro');
    expect(p.colors.map((c) => c.name)).toEqual(['Negro', 'Blanco']);
    expect(p.images).toEqual(['https://x/negro.jpg', 'https://x/general.jpg', 'https://x/blanco.jpg']);
    expect(p.imagesByColor.Blanco).toEqual(['https://x/blanco.jpg']);
  });

  it('calcula el descuento a partir de compare_at_price', () => {
    const p = normalizeProduct(row({ compare_at_price: '100000' }));
    expect(p.isSale).toBe(true);
    expect(p.originalPrice).toBe(100000);
    expect(p.discountPercent).toBe(20);
    expect(normalizeProduct(row()).discountPercent).toBe(0);
  });

  it('incluye la valoración cuando existe y tolera relaciones ausentes', () => {
    const p = normalizeProduct(row({ categories: null, brands: null, product_colors: null, product_images: null, variants: null }),
      new Map(), new Map([['p1', { rating: '4.5', review_count: '12' }]]));
    expect(p.rating).toBe(4.5);
    expect(p.reviewCount).toBe(12);
    expect(p.category).toBeNull();
    expect(p.images).toEqual([]);
    expect(p.rawVariants).toEqual([]);
  });

  it('imageUrl prioriza la URL externa y devuelve null sin imagen', () => {
    expect(imageUrl({ external_url: 'https://x/a.jpg', storage_path: 'a/b.jpg' })).toBe('https://x/a.jpg');
    expect(imageUrl(null)).toBeNull();
    expect(imageUrl({})).toBeNull();
  });
});
