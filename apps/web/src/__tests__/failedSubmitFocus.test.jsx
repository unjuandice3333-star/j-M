// @vitest-environment jsdom
// Ejecución 156 (D134): últimos botones que se deshabilitan o desaparecen sin control de foco: «Confirmar pedido» del
// checkout con error, el boletín de la portada al suscribirse y /admin/login (Google falla, rol sin permisos, «Cambiar
// cuenta»). Chromium quita el foco a un botón deshabilitado; jsdom no, así que se simula con blur() (igual que D130–D133).
// Páginas, servicios y stores son los reales; solo se sustituyen Supabase, el router (checkout) y el widget de Wompi.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { memoryStorage, makeSupabaseMock, makeProduct } from './helpers.js';

let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
vi.mock('react-router-dom', () => ({
  Link: React.forwardRef(({ to, children, state: _s, ...rest }, ref) => React.createElement('a', { href: typeof to === 'string' ? to : '#', ref, ...rest }, children)),
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/', state: null }),
}));
const openWompiWidget = vi.fn(async () => ({}));
vi.mock('../services/wompi', () => ({ wompiService: { openWompiWidget: (...a) => openWompiWidget(...a) } }));
vi.mock('../services/analytics', () => ({ analyticsService: new Proxy({}, { get: () => () => {} }) }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host; let root;
beforeEach(() => {
  vi.resetModules();
  supa = makeSupabaseMock();
  openWompiWidget.mockClear();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  document.body.innerHTML = '';
  host = document.createElement('div'); document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const flush = async () => { for (let i = 0; i < 4; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const button = (re) => [...host.querySelectorAll('button')].find((b) => re.test(b.textContent.trim()));
/** Como en Chromium: el control pulsado tiene el foco y lo pierde al deshabilitarse. */
const press = async (btn, fire) => {
  btn.focus();
  await act(async () => { fire(); btn.blur(); });
  await flush();
};
const submitForm = (btn) => () => btn.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
const clickIt = (btn) => () => btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

// ---------------------------------------------------------------- checkout
const line = (quantity, available) => ({
  variant_id: 'v-m-neg', product_name: 'Camiseta Básica', size_code: 'M', color_name: 'Negro', unit_price: 80000, quantity,
  line_total: 80000 * quantity, available, in_stock: available >= quantity,
});
const quoteOf = (lines) => ({
  subtotal: lines.reduce((s, l) => s + l.line_total, 0), discount_total: 0, shipping_cost: 0,
  total: lines.reduce((s, l) => s + l.line_total, 0), can_checkout: lines.every((l) => l.in_stock), coupon: null, lines,
});
const mountCheckout = async ({ createOrder, user = null } = {}) => {
  const orderSvc = await import('../services/orderService.js');
  const { useECommerceStore } = await import('../store/eCommerceStore.js');
  const { useAuthStore } = await import('../store/authStore.js');
  await useECommerceStore.persist.rehydrate();
  useECommerceStore.setState({ loadProducts: async () => {} });
  useECommerceStore.getState().addItem(makeProduct(), 'M', 'Negro', 2);
  const quote = vi.spyOn(orderSvc.orderService, 'quote').mockResolvedValue(quoteOf([line(2, 5)]));
  if (createOrder) useECommerceStore.setState({ createOrder });
  if (user) useAuthStore.setState({ user, isLoggedIn: true, profile: { id: user.id, role: 'customer' } });
  const { CheckoutPage } = await import('../pages/CheckoutPage.jsx');
  await act(async () => root.render(<CheckoutPage />));
  await flush();
  const set = (name, value) => {
    const el = host.querySelector(`[name="${name}"]`);
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    act(() => { el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  };
  set('firstName', 'Ana'); set('lastName', 'Gómez'); set('email', 'ana@example.com'); set('phone', '3001234567');
  set('department', 'Antioquia'); set('city', 'Medellín'); set('address', 'Calle 10 # 20-30');
  await flush();
  return { orderSvc, quote, submit: () => host.querySelector('button[type="submit"]') };
};

describe('checkout: «Confirmar pedido» con error no deja el foco en <body> (D134)', () => {
  it('fallo de red al crear el pedido → vuelve al botón de envío, con el aviso visible', async () => {
    const { submit } = await mountCheckout({ createOrder: async () => { throw new Error('Sin conexión. Revisa tu red.'); } });
    await press(submit(), submitForm(submit()));
    expect(host.querySelector('[role="alert"]').textContent).toMatch(/Sin conexión/);
    expect(submit().disabled).toBe(false);
    expect(document.activeElement).toBe(submit());
    expect(openWompiWidget).not.toHaveBeenCalled();
  });

  it('otra compra agotó el stock → foco en «Ajustar el carrito al stock disponible» (el envío queda deshabilitado)', async () => {
    let orderSvc;
    const ctx = await mountCheckout({
      createOrder: async () => { throw new orderSvc.OrderError('Stock insuficiente: Camiseta Básica', { hint: 'JM_OUT_OF_STOCK' }); },
    });
    ({ orderSvc } = ctx);
    ctx.quote.mockResolvedValue(quoteOf([line(2, 1)]));
    await press(ctx.submit(), submitForm(ctx.submit()));
    expect(ctx.submit().disabled).toBe(true);
    expect(document.activeElement?.id).toBe('checkout-stock-fix');
  });

  it('sesión vencida → foco en «Iniciar sesión»; «Continuar como invitado» desaparece y el foco va al envío', async () => {
    const { submit } = await mountCheckout({ user: { id: 'u1', email: 'ana@example.com' }, createOrder: async () => { throw new Error('no debe llamarse'); } });
    await press(submit(), submitForm(submit()));
    const login = [...host.querySelectorAll('a')].find((a) => a.textContent === 'Iniciar sesión');
    expect(login).toBeTruthy();
    expect(document.activeElement).toBe(login);
    const guest = button(/^Continuar como invitado$/);
    await press(guest, clickIt(guest));
    expect(button(/^Continuar como invitado$/)).toBeUndefined();
    expect(document.activeElement).toBe(submit());
  });
});

// ---------------------------------------------------------------- boletín
describe('boletín de la portada (D134)', () => {
  it('al suscribirse el formulario se sustituye por el aviso y el foco va al aviso', async () => {
    supa.state.rpc.subscribe_newsletter = { data: { ok: true }, error: null };
    const { NewsletterSignup } = await import('../components/Home/NewsletterSignup.jsx');
    await act(async () => root.render(<NewsletterSignup source="home" />));
    const input = host.querySelector('input[type=email]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'ana@x.co');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const btn = button(/^Suscribirme$/);
    await press(btn, submitForm(btn));
    const done = host.querySelector('[role="status"]');
    expect(done.textContent).toMatch(/quedó registrado/);
    expect(document.activeElement).toBe(done);
  });
});

// ---------------------------------------------------------------- /admin/login
const mountAdminLogin = async (state = {}) => {
  const { useAuthStore } = await import('../store/authStore.js');
  useAuthStore.setState({ isLoading: false, isLoggedIn: false, user: null, profile: null, ...state });
  const { AdminLogin } = await import('../pages/admin/AdminLogin.jsx');
  await act(async () => root.render(<AdminLogin />));
  await flush();
  const field = (type) => host.querySelector(`input[type="${type}"]`);
  return { useAuthStore, field };
};

describe('/admin/login (D134)', () => {
  it('Google falla → el foco vuelve al botón de Google', async () => {
    supa.auth.signInWithOAuth = vi.fn(async () => ({ data: null, error: { message: 'Proveedor no disponible' } }));
    await mountAdminLogin();
    const google = button(/Google/);
    await press(google, clickIt(google));
    expect(host.textContent).toMatch(/Proveedor no disponible/);
    expect(google.disabled).toBe(false);
    expect(document.activeElement).toBe(google);
  });

  it('cuenta sin rol administrativo → aviso y foco en el correo', async () => {
    const { useAuthStore, field } = await mountAdminLogin();
    useAuthStore.setState({
      login: async () => { useAuthStore.setState({ isLoading: true }); await Promise.resolve(); useAuthStore.setState({ isLoading: false, isLoggedIn: true, user: { id: 'u1', email: 'c@x.co' }, profile: { id: 'u1', role: 'customer' } }); },
    });
    const set = (el, v) => act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
    await set(field('email'), 'c@x.co');
    await set(field('password'), 'secreta-123');
    const submit = host.querySelector('button[type="submit"]');
    await press(submit, submitForm(submit));
    expect(host.textContent).toMatch(/no tiene permisos administrativos/);
    expect(document.activeElement).toBe(field('email'));
  });

  it('«Cambiar cuenta» cierra la sesión, el botón desaparece y el foco va al correo', async () => {
    const { field } = await mountAdminLogin({ isLoggedIn: true, user: { id: 'u1', email: 'c@x.co' }, profile: { id: 'u1', role: 'customer' } });
    const change = button(/Cambiar cuenta/);
    expect(change).toBeTruthy();
    await press(change, clickIt(change));
    expect(button(/Cambiar cuenta/)).toBeUndefined();
    expect(document.activeElement).toBe(field('email'));
  });
});
