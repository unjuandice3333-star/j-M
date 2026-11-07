import { describe, it, expect, vi } from 'vitest';
import { makeSupabaseMock } from './helpers.js';

const supa = makeSupabaseMock();
vi.mock('../config/supabase', () => ({ default: supa, supabase: supa }));
vi.mock('../config/runtimeConfig.js', () => ({
  getClientConfig: () => ({ supabase: { url: 'https://x.supabase.test' } }),
}));

const { normalizeProduct, imageUrl } = await import('../services/productService.js');
const { adminError, slugify, toReference } = await import('../services/adminService.js');

const dbProduct = (over = {}) => ({
  id: 'p1', reference: 'CAM-1', slug: 'cam', name: 'Camisa', base_price: '80000', compare_at_price: '100000',
  status: 'published', is_featured_new: true, is_bestseller: false,
  categories: { slug: 'camisas', name: 'Camisas', size_group: 'tops' },
  style_lines: null, brands: { name: 'J&M' },
  product_colors: [
    { color_id: 'c2', position: 2, is_default: false, colors: { slug: 'blanco', name: 'Blanco', hex_code: '#fff' } },
    { color_id: 'c1', position: 1, is_default: true, colors: { slug: 'negro', name: 'Negro', hex_code: '#000' } },
  ],
  product_images: [
    { id: 'i1', color_id: 'c1', storage_path: 'a/n.jpg', external_url: null, position: 1 },
    { id: 'i2', color_id: 'c2', storage_path: null, external_url: 'https://cdn/b.jpg', position: 1 },
    { id: 'i3', color_id: null, storage_path: 'a/g.jpg', external_url: null, position: 1 },
  ],
  variants: [
    { id: 'v1', sku: 'S1', color_id: 'c1', price_override: null, is_active: true, sizes: { code: 'L', sort_order: 2 } },
    { id: 'v2', sku: 'S2', color_id: 'c1', price_override: '90000', is_active: true, sizes: { code: 'M', sort_order: 1 } },
    { id: 'v3', sku: 'S3', color_id: 'c2', price_override: null, is_active: false, sizes: { code: 'S', sort_order: 0 } },
  ],
  product_occasions: [{ occasions: { slug: 'oficina', name: 'Oficina' } }],
  ...over,
});

describe('productService.normalizeProduct', () => {
  it('calcula precio, descuento, color por defecto y orden de tallas', () => {
    const p = normalizeProduct(dbProduct(), new Map([['v1', 2], ['v2', 3]]));
    expect(p.price).toBe(80000);
    expect(p.discountPercent).toBe(20);
    expect(p.isSale).toBe(true);
    expect(p.color).toBe('Negro');
    expect(p.colors.map((c) => c.name)).toEqual(['Negro', 'Blanco']);
    expect(p.sizes).toEqual(['M', 'L']);
    expect(p.rawVariants.map((v) => v.id)).toEqual(['v2', 'v1']);
    expect(p.occasion).toBe('oficina');
  });
  it('ignora variantes inactivas y respeta price_override', () => {
    const p = normalizeProduct(dbProduct());
    expect(p.rawVariants.find((v) => v.id === 'v3')).toBeUndefined();
    expect(p.rawVariants.find((v) => v.id === 'v2').price).toBe(90000);
  });
  it('stock = suma de disponibilidad; sin disponibilidad no está en stock', () => {
    expect(normalizeProduct(dbProduct(), new Map([['v1', 2], ['v2', 3]])).stock).toBe(5);
    const none = normalizeProduct(dbProduct());
    expect(none.stock).toBe(0);
    expect(none.inStock).toBe(false);
  });
  it('imágenes: primero las del color por defecto, sin duplicados, URL pública o externa', () => {
    const p = normalizeProduct(dbProduct());
    expect(p.images[0]).toBe('https://x.supabase.test/storage/v1/object/public/product-images/a/n.jpg');
    expect(p.imagesByColor.Blanco).toEqual(['https://cdn/b.jpg']);
    expect(new Set(p.images).size).toBe(p.images.length);
  });
  it('sin precio de comparación no hay descuento; incluye reseñas', () => {
    const p = normalizeProduct(dbProduct({ compare_at_price: null }), new Map(), new Map([['p1', { rating: '4.5', review_count: '3' }]]));
    expect(p.discountPercent).toBe(0);
    expect(p.isSale).toBe(false);
    expect(p.rating).toBe(4.5);
    expect(p.reviewCount).toBe(3);
  });
  it('imageUrl devuelve null sin imagen', () => {
    expect(imageUrl(null)).toBeNull();
    expect(imageUrl({})).toBeNull();
  });
});

describe('adminService utilidades', () => {
  it('slugify y toReference normalizan tildes y símbolos', () => {
    expect(slugify('  Camisa Básica — Ñandú! ')).toBe('camisa-basica-nandu');
    expect(toReference('cam básica 01')).toBe('CAM-BASICA-01');
    expect(slugify(null)).toBe('');
  });
  it('adminError traduce hint, duplicados, CHECK y RLS', () => {
    expect(adminError({ hint: 'JM_LAST_SUPER_ADMIN' }).message).toMatch(/último super administrador/);
    expect(adminError({ code: '23505', message: 'duplicate key products_slug_key' }).message).toMatch(/el slug/);
    expect(adminError({ code: '23505', message: 'reference' }).message).toMatch(/la referencia/);
    expect(adminError({ code: '23514', message: 'x' }).hint).toBe('CHECK');
    expect(adminError({ code: '42501', message: 'x' }).hint).toBe('JM_FORBIDDEN');
  });
  it('adminError conserva el error original como cause', () => {
    const raw = { code: '23505', message: 'sku dup' };
    const e = adminError(raw);
    expect(e.cause).toBe(raw);
    expect(e.message).toMatch(/SKU/);
  });
});
