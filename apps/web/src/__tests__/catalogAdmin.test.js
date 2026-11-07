import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memoryStorage, makeSupabaseMock } from './helpers.js';

const supa = makeSupabaseMock();
vi.mock('../config/supabase', () => ({ default: supa, supabase: supa }));

let normalizeProduct, imageUrl, adminService, adminError, slugify, toReference;

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('localStorage', memoryStorage());
  supa.state.rpc = {};
  supa.rpc.mockClear();
  ({ normalizeProduct, imageUrl } = await import('../services/productService.js'));
  ({ adminService, adminError, slugify, toReference } = await import('../services/adminService.js'));
});

const dbProduct = (over = {}) => ({
  id: 'p1', reference: 'CAM-001', slug: 'camiseta', name: 'Camiseta', base_price: '80000', compare_at_price: '100000',
  status: 'active', is_featured_new: true, is_bestseller: false,
  categories: { slug: 'camisetas', name: 'Camisetas', size_group: 'tops' },
  brands: { name: 'J&M' },
  product_colors: [
    { color_id: 'c2', position: 2, is_default: false, colors: { slug: 'blanco', name: 'Blanco', hex_code: '#fff' } },
    { color_id: 'c1', position: 1, is_default: true, colors: { slug: 'negro', name: 'Negro', hex_code: '#000' } },
  ],
  product_images: [
    { id: 'i2', color_id: 'c2', external_url: 'https://x/b.jpg', position: 1 },
    { id: 'i1', color_id: 'c1', external_url: 'https://x/n.jpg', position: 1 },
    { id: 'i0', color_id: null, external_url: 'https://x/g.jpg', position: 1 },
  ],
  variants: [
    { id: 'v-l', sku: 'L-N', color_id: 'c1', price_override: null, is_active: true, sizes: { code: 'L', sort_order: 2 } },
    { id: 'v-m', sku: 'M-N', color_id: 'c1', price_override: '90000', is_active: true, sizes: { code: 'M', sort_order: 1 } },
    { id: 'v-x', sku: 'X-N', color_id: 'c1', price_override: null, is_active: false, sizes: { code: 'XL', sort_order: 3 } },
  ],
  product_occasions: [{ occasions: { slug: 'casual' } }],
  ...over,
});

describe('productService.normalizeProduct', () => {
  it('ordena colores (predeterminado primero), tallas por orden y excluye variantes inactivas', () => {
    const p = normalizeProduct(dbProduct(), new Map([['v-l', 2], ['v-m', 3]]));
    expect(p.colors.map((c) => c.name)).toEqual(['Negro', 'Blanco']);
    expect(p.color).toBe('Negro');
    expect(p.sizes).toEqual(['M', 'L']);
    expect(p.rawVariants.map((v) => v.id)).toEqual(['v-m', 'v-l']);
  });

  it('usa price_override y precio base; calcula descuento', () => {
    const p = normalizeProduct(dbProduct());
    expect(p.price).toBe(80000);
    expect(p.rawVariants.find((v) => v.id === 'v-m').price).toBe(90000);
    expect(p.rawVariants.find((v) => v.id === 'v-l').price).toBe(80000);
    expect(p.originalPrice).toBe(100000);
    expect(p.discountPercent).toBe(20);
    expect(p.isSale).toBe(true);
  });

  it('stock = suma de disponibles; sin disponibilidad conocida => agotado', () => {
    expect(normalizeProduct(dbProduct(), new Map([['v-l', 2], ['v-m', 3]])).stock).toBe(5);
    const none = normalizeProduct(dbProduct());
    expect(none.stock).toBe(0);
    expect(none.inStock).toBe(false);
  });

  it('imágenes: primero las del color por defecto, luego generales, sin duplicados', () => {
    const p = normalizeProduct(dbProduct());
    expect(p.images).toEqual(['https://x/n.jpg', 'https://x/g.jpg', 'https://x/b.jpg']);
    expect(p.imagesByColor.Blanco).toEqual(['https://x/b.jpg']);
  });

  it('valoración y ocasiones; sin descuento si no hay precio de comparación', () => {
    const p = normalizeProduct(dbProduct({ compare_at_price: null }), new Map(), new Map([['p1', { rating: '4.5', review_count: '8' }]]));
    expect(p.rating).toBe(4.5);
    expect(p.reviewCount).toBe(8);
    expect(p.occasion).toBe('casual');
    expect(p.discountPercent).toBe(0);
    expect(p.isSale).toBe(false);
  });

  it('tolera relaciones ausentes', () => {
    const p = normalizeProduct({ id: 'p2', base_price: 1000, name: 'X' });
    expect(p.colors).toEqual([]);
    expect(p.images).toEqual([]);
    expect(p.category).toBeNull();
    expect(p.details).toEqual([]);
  });
});

describe('imageUrl', () => {
  it('prioriza URL externa, construye la pública de Storage y devuelve null sin datos', () => {
    expect(imageUrl({ external_url: 'https://a/b.jpg', storage_path: 'x' })).toBe('https://a/b.jpg');
    expect(imageUrl(null)).toBeNull();
    expect(imageUrl({})).toBeNull();
  });
});

describe('adminService', () => {
  it('slugify y toReference normalizan tildes y símbolos', () => {
    expect(slugify('  Camisa Ñandú -- Lino! ')).toBe('camisa-nandu-lino');
    expect(toReference('cam ñu/001')).toBe('CAM-NU-001');
  });

  it('upsertProduct envía el payload como { p } a admin_upsert_product', async () => {
    supa.state.rpc.admin_upsert_product = { data: { id: 'p9' }, error: null };
    const out = await adminService.upsertProduct({ name: 'X' });
    expect(out).toEqual({ id: 'p9' });
    expect(supa.rpc).toHaveBeenCalledWith('admin_upsert_product', { p: { name: 'X' } });
  });

  it('traduce pistas JM_* de la BD a mensajes en español', async () => {
    supa.state.rpc.admin_upsert_product = { data: null, error: { message: 'x', hint: 'JM_COLORS_REQUIRED' } };
    await expect(adminService.upsertProduct({})).rejects.toMatchObject({ message: expect.stringMatching(/al menos un color/), hint: 'JM_COLORS_REQUIRED' });
  });

  it('adminError: unicidad, check y permisos', () => {
    expect(adminError({ code: '23505', message: 'duplicate key slug' }).message).toMatch(/el slug/);
    expect(adminError({ code: '23505', message: 'duplicate sku' }).message).toMatch(/SKU/);
    expect(adminError({ code: '23514', message: 'c' }).hint).toBe('CHECK');
    expect(adminError({ code: '42501', message: 'rls' }).hint).toBe('JM_FORBIDDEN');
  });

  it('adjustInventory y transitionOrder mapean los parámetros de la RPC', async () => {
    supa.state.rpc.admin_adjust_inventory = { data: true, error: null };
    supa.state.rpc.admin_transition_order = { data: true, error: null };
    await adminService.adjustInventory('v1', 5, 'restock', 'ingreso');
    await adminService.transitionOrder('o1', 'shipped', null, { carrier: 'X' });
    expect(supa.rpc).toHaveBeenCalledWith('admin_adjust_inventory', { p_variant_id: 'v1', p_quantity_change: 5, p_movement_type: 'restock', p_reason: 'ingreso' });
    expect(supa.rpc).toHaveBeenCalledWith('admin_transition_order', { p_order_id: 'o1', p_to: 'shipped', p_note: null, p_tracking: { carrier: 'X' } });
  });
});
