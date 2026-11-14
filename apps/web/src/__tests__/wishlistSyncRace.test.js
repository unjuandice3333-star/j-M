// @vitest-environment jsdom
// D118: un favorito marcado (o desmarcado) mientras syncWishlist lee la BD tras iniciar sesión no se pierde.
// Antes la lectura sobrescribía la lista: el recorrido E2E 69 vio «MIS FAVORITOS (0)» en CI.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const db = vi.hoisted(() => ({ rows: new Set(), gate: null, calls: [], failAdd: false }));
vi.mock('../services/wishlistService', () => ({
  wishlistService: {
    async getIds() { const snap = [...db.rows]; if (db.gate) await db.gate; return snap; },
    async addMany(_u, ids) { if (db.failAdd) throw new Error('No se pudo guardar en tu lista de deseos.'); db.calls.push(['add', ...ids]); ids.forEach((id) => db.rows.add(id)); },
    async remove(_u, id) { db.calls.push(['remove', id]); db.rows.delete(id); },
  },
  default: {},
}));
vi.mock('../config/supabase', () => ({ default: {}, supabase: {} }));

import { useECommerceStore } from '../store/eCommerceStore';

const deferred = () => { let release; const gate = new Promise((r) => { release = r; }); return { gate, release }; };
const store = () => useECommerceStore.getState();

describe('syncWishlist con cambios durante la lectura', () => {
  beforeEach(() => {
    db.rows = new Set(['a']); db.gate = null; db.calls = [];
    useECommerceStore.setState({ wishlist: [], wishlistOwner: null, wishlistError: null, wishlistOutbox: {} });
  });

  it('un favorito marcado antes de terminar la sincronización queda en la lista y en la BD', async () => {
    const d = deferred(); db.gate = d.gate;
    const sync = store().syncWishlist('u1');
    await store().toggleWishlist('b'); // aún sin dueño: solo local
    d.release(); await sync;
    expect(store().wishlist).toEqual(['a', 'b']);
    expect(db.rows.has('b')).toBe(true);
    expect(store().wishlistOwner).toBe('u1');
  });

  it('un favorito quitado durante la lectura no reaparece y se borra de la BD', async () => {
    useECommerceStore.setState({ wishlist: ['a'], wishlistOwner: 'u1' });
    const d = deferred(); db.gate = d.gate;
    const sync = store().syncWishlist('u1');
    await store().toggleWishlist('a'); // con dueño: borra en la BD, pero la lectura ya tenía «a»
    d.release(); await sync;
    expect(store().wishlist).toEqual([]);
    expect(db.rows.has('a')).toBe(false);
    expect(db.calls).toEqual([['remove', 'a']]); // no se repite lo ya enviado
  });

  it('sin cambios durante la lectura, la BD manda (otro dispositivo)', async () => {
    useECommerceStore.setState({ wishlist: ['z'], wishlistOwner: 'u1' });
    await store().syncWishlist('u1');
    expect(store().wishlist).toEqual(['a']);
    await store().toggleWishlist('c');
    expect(db.calls).toEqual([['add', 'c']]);
  });
});

// D119: la petición del favorito se cortó (recarga o pestaña cerrada) antes de llegar a la BD.
describe('wishlistOutbox: cambios sin confirmar se reenvían al sincronizar', () => {
  beforeEach(() => {
    db.rows = new Set(['a']); db.gate = null; db.calls = [];
    useECommerceStore.setState({ wishlist: [], wishlistOwner: null, wishlistError: null, wishlistOutbox: {} });
  });

  it('queda en la bandeja mientras la petición está en vuelo y sale al confirmarse', async () => {
    useECommerceStore.setState({ wishlist: ['a'], wishlistOwner: 'u1' });
    const p = store().toggleWishlist('b');
    expect(store().wishlistOutbox).toEqual({ b: 'add' });
    await p;
    expect(store().wishlistOutbox).toEqual({});
  });

  it('tras recargar con un guardado sin confirmar, la sincronización lo envía y no lo pierde', async () => {
    useECommerceStore.setState({ wishlist: ['a', 'b'], wishlistOwner: 'u1', wishlistOutbox: { b: 'add' } });
    await store().syncWishlist('u1');
    expect(db.rows.has('b')).toBe(true);
    expect(store().wishlist).toEqual(['a', 'b']);
    expect(store().wishlistOutbox).toEqual({});
  });

  it('tras recargar con un borrado sin confirmar, la sincronización lo borra y no reaparece', async () => {
    useECommerceStore.setState({ wishlist: [], wishlistOwner: 'u1', wishlistOutbox: { a: 'remove' } });
    await store().syncWishlist('u1');
    expect(db.rows.has('a')).toBe(false);
    expect(store().wishlist).toEqual([]);
  });

  it('si la página se está yendo (recarga), el error de la petición cortada no revierte nada y queda en la bandeja', async () => {
    useECommerceStore.setState({ wishlist: ['a'], wishlistOwner: 'u1' });
    db.failAdd = true;
    window.dispatchEvent(new Event('beforeunload'));
    const r = await store().toggleWishlist('b');
    expect(r.ok).toBe(false);
    expect(store().wishlist).toEqual(['a', 'b']);
    expect(store().wishlistOutbox).toEqual({ b: 'add' });
    // de vuelta en la página (bfcache) un error real sí revierte
    window.dispatchEvent(new Event('pageshow'));
    await store().toggleWishlist('c');
    expect(store().wishlist).toEqual(['a', 'b']);
    db.failAdd = false;
  });

  it('la bandeja de otra cuenta no se aplica y se descarta; cerrar sesión la vacía', async () => {
    useECommerceStore.setState({ wishlist: ['b'], wishlistOwner: 'u2', wishlistOutbox: { b: 'add' } });
    await store().syncWishlist('u1');
    expect(db.calls).toEqual([]);
    expect(store().wishlistOutbox).toEqual({});
    useECommerceStore.setState({ wishlistOutbox: { a: 'remove' } });
    await store().syncWishlist(null);
    expect(store().wishlistOutbox).toEqual({});
  });
});
