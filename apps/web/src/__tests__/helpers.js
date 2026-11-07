// Utilidades de prueba: SOLO se simula Supabase (dependencia externa). Stores y servicios son los reales.
import { vi } from 'vitest';

export function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
  };
}

/** Cliente Supabase falso: cada prueba programa las respuestas de rpc/auth/from. */
export function makeSupabaseMock() {
  const state = { rpc: {}, tables: {}, auth: {} };
  const chain = (rows) => {
    const q = { select: () => q, eq: () => q, order: () => q, single: async () => ({ data: Array.isArray(rows) ? rows[0] ?? null : rows, error: null }),
      then: (res) => res({ data: rows, error: null }) };
    return q;
  };
  return {
    state,
    rpc: vi.fn(async (name, args) => {
      const h = state.rpc[name];
      if (!h) return { data: null, error: { message: `rpc ${name} no programada` } };
      return typeof h === 'function' ? h(args) : h;
    }),
    from: vi.fn((table) => chain(state.tables[table] ?? [])),
    auth: {
      getSession: vi.fn(async () => state.auth.getSession ?? { data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
      signInWithPassword: vi.fn(async (c) => (state.auth.signIn ? state.auth.signIn(c) : { data: null, error: { message: 'Invalid login credentials' } })),
      signUp: vi.fn(async (c) => (state.auth.signUp ? state.auth.signUp(c) : { data: null, error: { message: 'signUp no programado' } })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  };
}

/** Producto normalizado como lo entrega productService (variantes reales con talla/color/stock). */
export function makeProduct(over = {}) {
  const variants = over.rawVariants ?? [
    { id: 'v-m-neg', sku: 'CAM-M-NEG', size: 'M', color: 'Negro', price: 80000, available: 5 },
    { id: 'v-l-neg', sku: 'CAM-L-NEG', size: 'L', color: 'Negro', price: 80000, available: 1 },
    { id: 'v-m-bla', sku: 'CAM-M-BLA', size: 'M', color: 'Blanco', price: 85000, available: 0 },
    { id: 'v-s-bla', sku: 'CAM-S-BLA', size: 'S', color: 'Blanco', price: 85000, available: 3 },
  ];
  return { id: 'p1', slug: 'camiseta-basica', name: 'Camiseta Básica', originalPrice: 100000, images: ['img.jpg'], imagesByColor: {}, rawVariants: variants, ...over };
}
