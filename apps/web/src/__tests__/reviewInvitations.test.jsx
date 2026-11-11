// @vitest-environment jsdom
// Ejecución 72: «Opina sobre tus compras» en Mis pedidos (my_review_invitations). Solo se simula Supabase.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

let supa;
let rows;
let rpcError;

vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root;
const flush = () => act(async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); });

beforeEach(() => {
  rows = [
    { order_item_id: 'i1', order_number: 'JM-0001', delivered_at: '2026-11-01T00:00:00Z', product_id: 'p1', product_name: 'Camiseta Oxford',
      slug: 'camiseta-oxford', image_url: 'https://img/1.jpg', size_code: 'M', color_name: 'Negro' },
    { order_item_id: 'i2', order_number: 'JM-0001', delivered_at: '2026-11-01T00:00:00Z', product_id: 'p2', product_name: 'Jean Slim',
      slug: 'jean-slim', image_url: null, size_code: '32', color_name: 'Azul' },
  ];
  rpcError = null;
  supa = { rpc: vi.fn(async (name) => {
    if (name !== 'my_review_invitations') return { data: null, error: { message: 'rpc no programada' } };
    return rpcError ? { data: null, error: rpcError } : { data: rows, error: null };
  }) };
});
afterEach(() => { act(() => root?.unmount()); host?.remove(); });

async function mount() {
  const { ReviewInvitations } = await import('../components/Account/ReviewInvitations.jsx');
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(<MemoryRouter><ReviewInvitations refreshKey={1} /></MemoryRouter>); });
  await flush();
}

describe('fetchReviewInvitations', () => {
  it('mapea las filas y descarta las que no tienen slug', async () => {
    rows.push({ order_item_id: 'i3', product_name: 'Sin slug', slug: null });
    const { fetchReviewInvitations } = await import('../services/reviewsService.js');
    const list = await fetchReviewInvitations();
    expect(list.map((r) => r.slug)).toEqual(['camiseta-oxford', 'jean-slim']);
    expect(list[0]).toMatchObject({ orderItemId: 'i1', orderNumber: 'JM-0001', productName: 'Camiseta Oxford', size: 'M', color: 'Negro', imageUrl: 'https://img/1.jpg' });
    expect(supa.rpc).toHaveBeenCalledWith('my_review_invitations');
  });

  it('marca como no disponible si la RPC no existe en el entorno', async () => {
    rpcError = { code: 'PGRST202', message: 'Could not find the function' };
    const { fetchReviewInvitations } = await import('../services/reviewsService.js');
    await expect(fetchReviewInvitations()).rejects.toMatchObject({ missing: true });
  });
});

describe('ReviewInvitations', () => {
  it('lista cada producto con enlace a la sección de opiniones de su ficha', async () => {
    await mount();
    const links = [...host.querySelectorAll('a')];
    expect(host.textContent).toContain('OPINA SOBRE TUS COMPRAS');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/producto/camiseta-oxford#opiniones', '/producto/jean-slim#opiniones']);
    expect(links[0].getAttribute('aria-label')).toBe('Opinar sobre Camiseta Oxford');
    expect(host.textContent).toContain('Pedido JM-0001 · Talla 32 · Azul');
  });

  it('no muestra nada si no hay invitaciones', async () => {
    rows = [];
    await mount();
    expect(host.innerHTML).toBe('');
  });

  it('no muestra nada si la RPC falla (no tapa el historial)', async () => {
    rpcError = { code: 'PGRST202', message: 'missing' };
    await mount();
    expect(host.innerHTML).toBe('');
  });
});
