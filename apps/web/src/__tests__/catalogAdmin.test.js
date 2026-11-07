import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeSupabaseMock } from './helpers.js';

const supa = makeSupabaseMock();
vi.mock('../config/supabase', () => ({ default: supa, supabase: supa }));
vi.mock('../config/runtimeConfig.js', () => ({ getClientConfig: () => ({ supabase: { url: 'https://example.test' } }) }));

let normalizeProduct, imageUrl, adminService, adminError, slugify, toReference;
beforeEach(async () => {
  vi.resetModules();
  supa.state.rpc = {}; supa.state.tables = {}; supa.rpc.mockClear();
  ({ normalizeProduct, imageUrl } = await import('../services/productService.js'));
  ({ adminService, adminError, slugify, toReference } = await import('../services/adminService.js'));
});

const row = () => ({
  id: 'p1', reference: 'CAM-01', slug: 'camisa', name: 'Camisa', base_price: '100000', compare_at_price: '125000',
  status: 'active', is_featured_new: true, is_bestseller: false, description: null, details: null,
  categories: { slug: 'camisas', name: 'Camisas', size_group: 'tops' },
  product_colors: [
    { color_id: 'c2', position: 2, is_default: false, colors: { slug: 'azul', name: 'Azul', hex_code: '#00f' } },
    { color_id: 'c1', position: 1, is_default: true, colors: { slug: 'negro', name: 'Negro', hex_code: '#000' } },
  ],
  product_images: [
    { color_id: 'c2', external_url: 'https://x/azul.jpg', position: 1 },
    { color_id: 'c1', storage_path: 'camisa/n.jpg', position: 1 },
    { color_id: null, external_url: 'https://x/general.jpg', position: 1 },
  ],
  variants: [
    { id: 'v2', sku: 'S2', color_id: 'c1', is_active: true, price_override: '90000', sizes: { code: 'L', sort_order: 2 } },
    { id: 'v1', sku: 'S1', color_id: 'c1', is_active: true, price_override: null, sizes: { code: 'M', sort_order: 1 } },
    { id: 'v3', sku: 'S3', color_id: 'c2', is_active: false, sizes: { code: 'S', sort_order: 0 } },
  ],
});

describe('productService.normalizeProduct', () => {
  it('color por defecto primero, imágenes ordenadas y sin duplicados', () => {
    const p = normalizeProduct(row());
    expect(p.color).toBe('Negro');
    expect(p.colors.map((c) => c.name)).toEqual(['Negro', 'Azul']);
    expect(p.images).toEqual([
      'https://example.test/storage/v1/object/public/product-images/camisa/n.jpg',
      'https://x/general.jpg', 'https://x/azul.jpg',
    ]);
  });
  it('ignora variantes inactivas, ordena tallas y aplica price_override', () => {
    const p = normalizeProduct(row());
    expect(p.sizes).toEqual(['M', 'L']);
    expect(p.rawVariants.map((v) => [v.id, v.price])).toEqual([['v1', 100000], ['v2', 90000]]);
  });
  it('stock = suma de disponibilidad de la vista; sin disponibilidad → agotado', () => {
    expect(normalizeProduct(row()).inStock).toBe(false);
    const p = normalizeProduct(row(), new Map([['v1', 3], ['v2', 2], ['v3', 9]]));
    expect(p.stock).toBe(5);
    expect(p.inStock).toBe(true);
  });
  it('descuento calculado desde compare_at_price; sin él, 0 y no está en oferta', () => {
    expect(normalizeProduct(row())).toMatchObject({ discountPercent: 20, isSale: true, originalPrice: 125000, isNew: true, isBestSeller: false });
    const r = row(); r.compare_at_price = null;
    expect(normalizeProduct(r)).toMatchObject({ discountPercent: 0, isSale: false, originalPrice: null });
  });
  it('valores nulos se normalizan sin lanzar', () => {
    const p = normalizeProduct({ id: 'x', base_price: 5000 });
    expect(p).toMatchObject({ colors: [], sizes: [], images: [], description: '', details: [], rating: null, reviewCount: 0, category: null });
  });
  it('calificación de la vista de reseñas', () => {
    const p = normalizeProduct(row(), new Map(), new Map([['p1', { rating: '4.5', review_count: '12' }]]));
    expect(p).toMatchObject({ rating: 4.5, reviewCount: 12 });
  });
  it('imageUrl: sin datos → null', () => { expect(imageUrl(null)).toBeNull(); expect(imageUrl({})).toBeNull(); });
});

describe('adminService', () => {
  it('upsertProduct envía el payload en p y devuelve el resultado', async () => {
    supa.state.rpc.admin_upsert_product = { data: { id: 'p1' }, error: null };
    expect(await adminService.upsertProduct({ name: 'Camisa' })).toEqual({ id: 'p1' });
    expect(supa.rpc).toHaveBeenCalledWith('admin_upsert_product', { p: { name: 'Camisa' } });
  });
  it.each([
    ['JM_FORBIDDEN', /No tienes permisos/], ['JM_COLORS_REQUIRED', /al menos un color/], ['JM_PUBLISH_NO_IMAGES', /al menos una imagen/],
  ])('upsertProduct traduce %s a mensaje de negocio', async (hint, re) => {
    supa.state.rpc.admin_upsert_product = { data: null, error: { hint, message: 'SQL interno' } };
    const err = await adminService.upsertProduct({}).catch((e) => e);
    expect(err.message).toMatch(re);
    expect(err.message).not.toMatch(/SQL/);
  });
  it('duplicados (23505) indican qué campo se repite', () => {
    expect(adminError({ code: '23505', message: 'products_slug_key' }).message).toMatch(/el slug/);
    expect(adminError({ code: '23505', message: 'products_reference_key' }).message).toMatch(/la referencia/);
    expect(adminError({ code: '23505', message: 'variants_sku_key' }).message).toMatch(/un SKU/);
  });
  it('CHECK (23514) y RLS (42501) tienen mensaje propio', () => {
    expect(adminError({ code: '23514', message: 'x' }).hint).toBe('CHECK');
    expect(adminError({ code: '42501', message: 'x' }).hint).toBe('JM_FORBIDDEN');
  });
  it('slugify y toReference quitan tildes y símbolos', () => {
    expect(slugify('  Camisa Ñandú -- Lino! ')).toBe('camisa-nandu-lino');
    expect(toReference('camisa lino/01')).toBe('CAMISA-LINO-01');
    expect(slugify(null)).toBe('');
  });
});
