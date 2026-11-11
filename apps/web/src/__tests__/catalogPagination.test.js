// Catálogo, valoraciones y lista de deseos sin cortes silenciosos de PostgREST (max_rows = 1000).
// Solo se simula Supabase: emula el corte en 1000 filas, `in`, `eq` y `range`; servicios reales.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const MAX_ROWS = 1000;
function fakeSupabase() {
  const state = { tables: {}, errors: {}, queries: [] };
  const from = vi.fn((table) => {
    const rec = { table, eq: [], in: null, range: null, orders: [] };
    const q = {
      select: () => q,
      eq: (c, v) => { rec.eq.push([c, v]); return q; },
      in: (c, v) => { rec.in = [c, v]; return q; },
      order: (c) => { rec.orders.push(c); return q; },
      range: (a, b) => { rec.range = [a, b]; return q; },
      then: (res, rej) => {
        state.queries.push(rec);
        if (state.errors[table]) return Promise.resolve({ data: null, error: state.errors[table] }).then(res, rej);
        let rows = state.tables[table] ?? [];
        rec.eq.forEach(([c, v]) => { rows = rows.filter((r) => r[c] === v); });
        if (rec.in) { const set = new Set(rec.in[1]); rows = rows.filter((r) => set.has(r[rec.in[0]])); }
        const [a, b] = rec.range ?? [0, Infinity];
        // Como PostgREST: nunca más de max_rows filas por respuesta, pidas lo que pidas.
        rows = rows.slice(a, Math.min(b + 1, a + MAX_ROWS));
        return Promise.resolve({ data: rows, error: null }).then(res, rej);
      },
    };
    return q;
  });
  return { state, from };
}

let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
vi.mock('../config/runtimeConfig.js', () => ({ getClientConfig: () => ({ supabase: { url: 'https://x.supabase.test' } }) }));

const product = (i) => ({
  id: `p${String(i).padStart(5, '0')}`, slug: `p-${i}`, name: `P${i}`, base_price: 50000, status: 'active',
  product_colors: [], product_images: [], product_occasions: [],
  variants: [0, 1].map((k) => ({ id: `v${i}-${k}`, sku: `S${i}-${k}`, color_id: null, price_override: null, is_active: true, sizes: { code: k ? 'L' : 'M', sort_order: k } })),
});

beforeEach(() => { vi.resetModules(); supa = fakeSupabase(); });

describe('productService.getProducts', () => {
  it('devuelve más de 1000 productos con el stock de TODAS sus variantes', async () => {
    const products = Array.from({ length: 1205 }, (_, i) => product(i));
    supa.state.tables.products = products;
    supa.state.tables.v_variant_availability = products.flatMap((p) => p.variants.map((v) => ({ product_id: p.id, variant_id: v.id, available: 4 })));
    supa.state.tables.v_product_rating = [{ product_id: 'p01204', rating: 4.5, review_count: 2 }];
    const { productService } = await import('../services/productService.js');
    const list = await productService.getProducts();
    expect(list).toHaveLength(1205);
    const last = list.find((p) => p.id === 'p01204');
    expect(last.stock).toBe(8);
    expect(last.inStock).toBe(true);
    expect(list.every((p) => p.stock === 8)).toBe(true);
    // Lista `in` troceada (URL acotada) y orden total en productos.
    const inQueries = supa.state.queries.filter((q) => q.in);
    expect(Math.max(...inQueries.map((q) => q.in[1].length))).toBeLessThanOrEqual(100);
    expect(supa.state.queries.find((q) => q.table === 'products').orders).toEqual(['published_at', 'id']);
  });

  it('un catálogo pequeño sigue usando una sola consulta por tabla', async () => {
    supa.state.tables.products = [product(1)];
    supa.state.tables.v_variant_availability = [{ product_id: 'p00001', variant_id: 'v1-0', available: 2 }];
    const { productService } = await import('../services/productService.js');
    const [p] = await productService.getProducts();
    expect(p.stock).toBe(2);
    expect(supa.state.queries.map((q) => q.table)).toEqual(['products', 'v_variant_availability', 'v_product_rating']);
  });

  it('un error en la disponibilidad de cualquier trozo se propaga como CatalogError', async () => {
    supa.state.tables.products = Array.from({ length: 250 }, (_, i) => product(i));
    supa.state.errors.v_variant_availability = { message: 'boom' };
    const { productService, CatalogError } = await import('../services/productService.js');
    await expect(productService.getProducts()).rejects.toBeInstanceOf(CatalogError);
  });
});

describe('fetchAllIn', () => {
  it('trocea, pagina cada trozo y elimina ids repetidos', async () => {
    const { fetchAllIn, chunk } = await import('../utils/fetchAll.js');
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    supa.state.tables.t = Array.from({ length: 3000 }, (_, i) => ({ k: i % 3, id: i }));
    const r = await fetchAllIn((ids) => supa.from('t').select('*').in('k', ids).order('id'), [0, 1, 2, 2], { chunkSize: 2 });
    expect(r.data).toHaveLength(3000);
    expect(r.capped).toBe(false);
    expect(supa.state.queries.filter((q) => q.in).map((q) => q.in[1].length).sort()).toEqual([1, 1, 2, 2, 2]);
  });
});

describe('wishlistService.getIds', () => {
  it('lee más de 1000 favoritos en orden', async () => {
    supa.state.tables.wishlist_items = Array.from({ length: 1100 }, (_, i) => ({ product_id: `p${i}` }));
    const { wishlistService } = await import('../services/wishlistService.js');
    const ids = await wishlistService.getIds();
    expect(ids).toHaveLength(1100);
    expect(ids[1099]).toBe('p1099');
  });
});
