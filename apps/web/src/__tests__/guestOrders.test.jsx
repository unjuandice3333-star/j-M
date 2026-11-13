// @vitest-environment jsdom
// Ejecución 116 (D88): pedidos de invitado frente a la cuenta.
// - Los pedidos que el navegador recuerda guardan su dueño; al cerrar sesión se olvidan los de la cuenta (otra persona
//   en el mismo equipo no recibe su enlace con nombre y dirección) y se conservan los de invitado.
// - «Mis pedidos» explica que un pedido hecho sin sesión no se agrega a la cuenta y lista los de este navegador.
// - La confirmación sin sesión ofrece copiar el enlace del pedido (no hay correo transaccional).
// Solo se simula Supabase; páginas y store son los reales.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const ME = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const GUEST_ID = '11111111-2222-4333-8444-555555555555';
const MINE_ID = '22222222-2222-4333-8444-555555555555';
const TOKEN = '99999999-8888-4777-8666-555555555555';

function fakeSupabase() {
  const state = { orders: [], rpc: {} };
  const from = (table) => {
    const q = {
      select: () => q, eq: () => q, order: () => q, limit: () => q, range: () => q, or: () => q, in: () => q,
      maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: null, error: null }),
      then: (r, j) => Promise.resolve({ data: table === 'online_orders' ? state.orders.map((o) => ({ ...o })) : [], error: null }).then(r, j),
    };
    return q;
  };
  const rpc = vi.fn(async (name) => {
    const h = state.rpc[name];
    return h ? { data: typeof h === 'function' ? h() : h, error: null } : { data: [], error: null };
  });
  return { state, from, rpc, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
}

let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
vi.mock('../services/wompi', () => ({ wompiService: { openWompiWidget: vi.fn() } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container; let root;
beforeEach(() => {
  vi.resetModules();
  supa = fakeSupabase();
  localStorage.clear();
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

const flush = async () => { for (let i = 0; i < 10; i += 1) await act(async () => { await Promise.resolve(); }); };
const q = (id) => container.querySelector(`[data-testid="${id}"]`);
const remembered = (id, n) => ({ id, order_number: n, public_token: TOKEN, total: 50000, status: 'payment_pending', created_at: new Date().toISOString() });

describe('store: pedidos recordados y sesión', () => {
  it('el pedido recordado con sesión guarda su dueño; sin sesión queda como invitado', async () => {
    const { useECommerceStore } = await import('../store/eCommerceStore');
    const s = useECommerceStore.getState();
    s.syncSession(null);
    s.rememberOrder(remembered(GUEST_ID, 'JM-1'));
    useECommerceStore.getState().syncSession(ME);
    useECommerceStore.getState().rememberOrder(remembered(MINE_ID, 'JM-2'));
    const byId = Object.fromEntries(useECommerceStore.getState().orders.map((o) => [o.id, o.owner]));
    expect(byId).toEqual({ [GUEST_ID]: null, [MINE_ID]: ME });
  });

  it('al cerrar sesión se olvidan los pedidos de la cuenta (y su checkout en curso) y se conservan los de invitado', async () => {
    const { useECommerceStore } = await import('../store/eCommerceStore');
    useECommerceStore.getState().syncSession(null);
    useECommerceStore.getState().rememberOrder(remembered(GUEST_ID, 'JM-1'));
    useECommerceStore.getState().syncSession(ME);
    useECommerceStore.getState().rememberOrder(remembered(MINE_ID, 'JM-2'));
    useECommerceStore.setState({ activeCheckoutOrderId: MINE_ID });
    useECommerceStore.getState().syncSession(null);
    const st = useECommerceStore.getState();
    expect(st.orders.map((o) => o.id)).toEqual([GUEST_ID]);
    expect(st.activeCheckoutOrderId).toBeNull();
  });

  it('si la primera lectura de la sesión es «sin sesión» (venció con el navegador cerrado), también se olvidan', async () => {
    localStorage.setItem('jm-fashion-store-cart-v14', JSON.stringify({ version: 15, state: {
      items: [], wishlist: [], wishlistOwner: null, appliedCoupon: null, savedAddresses: [], activeCheckoutOrderId: GUEST_ID,
      orders: [{ ...remembered(MINE_ID, 'JM-2'), owner: ME }, { ...remembered(GUEST_ID, 'JM-1'), owner: null }, remembered('33333333-2222-4333-8444-555555555555', 'JM-0')],
    } }));
    const { useECommerceStore } = await import('../store/eCommerceStore');
    useECommerceStore.getState().syncSession(null);
    const st = useECommerceStore.getState();
    // los guardados antes de esta versión (sin owner) se tratan como invitado: no se pierden
    expect(st.orders.map((o) => o.order_number)).toEqual(['JM-1', 'JM-0']);
    expect(st.activeCheckoutOrderId).toBe(GUEST_ID);
  });
});

describe('«Mis pedidos»: pedidos hechos sin sesión', () => {
  const mountAccount = async () => {
    const { useAuthStore } = await import('../store/authStore');
    useAuthStore.setState({ isLoggedIn: true, isLoading: false, user: { id: ME, email: 'ana@correo.com' }, profile: { id: ME, full_name: 'Ana', role: 'customer' } });
    const { AccountPage } = await import('../pages/AccountPage');
    await act(async () => { root.render(<MemoryRouter initialEntries={['/cuenta/pedidos']}><AccountPage /></MemoryRouter>); });
    await flush();
  };

  it('explica la regla y enlaza los pedidos de invitado de este navegador (no los que ya están en la cuenta)', async () => {
    const { useECommerceStore } = await import('../store/eCommerceStore');
    useECommerceStore.setState({ orders: [{ ...remembered(GUEST_ID, 'JM-1'), owner: null }, { ...remembered(MINE_ID, 'JM-2'), owner: null }] });
    supa.state.orders = [{ id: MINE_ID, order_number: 'JM-2', public_token: TOKEN, status: 'payment_pending', total: 50000, subtotal: 50000, discount_total: 0, shipping_cost: 0, created_at: new Date().toISOString(), payment_expires_at: new Date(Date.now() + 3600e3).toISOString(), online_order_items: [] }];
    await mountAccount();
    const box = q('guest-orders');
    expect(box).not.toBeNull();
    expect(box.textContent).toContain('no se agregan a tu cuenta');
    const links = [...box.querySelectorAll('a')];
    expect(links.map((a) => a.textContent)).toEqual(['JM-1']);
    expect(links[0].getAttribute('href')).toBe(`/checkout/confirmacion?order=JM-1&token=${TOKEN}`);
  });

  it('sin pedidos de invitado solo muestra la explicación', async () => {
    await mountAccount();
    const box = q('guest-orders');
    expect(box.textContent).toContain('¿Compraste sin iniciar sesión?');
    expect(box.querySelectorAll('a')).toHaveLength(0);
  });
});

describe('Confirmación: enlace para el invitado', () => {
  const pending = { id: GUEST_ID, order_number: 'JM-1', status: 'payment_pending', status_label: 'Pendiente de pago',
    customer_name: 'Ana', customer_email: 'ana@x.co', payment_expires_at: new Date(Date.now() + 3600e3).toISOString(),
    shipping: { department: 'Antioquia', city: 'Medellín', address: 'Cra 1', method: 'standard' },
    subtotal: 50000, discount_total: 0, shipping_cost: 0, total: 50000, items: [], timeline: [] };
  const mountConfirmation = async (user) => {
    const { useAuthStore } = await import('../store/authStore');
    useAuthStore.setState({ isLoggedIn: Boolean(user), isLoading: false, user, profile: null });
    supa.state.rpc.get_order_public = pending;
    const { OrderConfirmationPage } = await import('../pages/OrderConfirmationPage');
    await act(async () => { root.render(<MemoryRouter initialEntries={[`/checkout/confirmacion?order=JM-1&token=${TOKEN}&pago=error`]}><OrderConfirmationPage /></MemoryRouter>); });
    await flush();
  };

  it('sin sesión muestra el enlace limpio (sin pago=error) y lo copia', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await mountConfirmation(null);
    const box = q('guest-order-link');
    expect(box).not.toBeNull();
    const expected = `${window.location.origin}/checkout/confirmacion?order=JM-1&token=${TOKEN}`;
    expect(box.querySelector('input').value).toBe(expected);
    expect(box.querySelector('input').labels[0].textContent).toBe('Enlace del pedido');
    await act(async () => { [...box.querySelectorAll('button')].find((b) => b.textContent === 'Copiar enlace').click(); });
    await flush();
    expect(writeText).toHaveBeenCalledWith(expected);
    expect(box.querySelector('[role=status]').textContent).toBe('Enlace copiado.');
  });

  it('si el portapapeles falla, pide copiarlo a mano', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denegado'); } }, configurable: true });
    await mountConfirmation(null);
    await act(async () => { [...q('guest-order-link').querySelectorAll('button')].find((b) => b.textContent === 'Copiar enlace').click(); });
    await flush();
    expect(q('guest-order-link').querySelector('[role=status]').textContent).toContain('cópialo manualmente');
  });

  it('con sesión no se muestra (el pedido está en «Mis pedidos»)', async () => {
    await mountConfirmation({ id: ME, email: 'ana@correo.com' });
    expect(q('guest-order-link')).toBeNull();
  });
});
