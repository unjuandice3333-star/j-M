import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memoryStorage, makeSupabaseMock, makeProduct } from './helpers.js';
import { validateCheckout, cartKeyOf } from '../utils/checkoutRules.js';

const supa = makeSupabaseMock();
vi.mock('../config/supabase', () => ({ default: supa, supabase: supa }));

let store, orderSvc;
const STD = { code: 'standard', name: 'Estándar', cost: 12000, free_over_subtotal: 200000 };
const product = makeProduct();

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  supa.state.rpc = {}; supa.rpc.mockClear();
  ({ useECommerceStore: store } = await import('../store/eCommerceStore.js'));
  orderSvc = await import('../services/orderService.js');
  await store.persist.rehydrate();
  store.setState({ products: [product], shippingMethods: [STD] });
});
const S = () => store.getState();

describe('totales (estimación local antes de la cotización de la BD)', () => {
  it('subtotal = suma de precio × cantidad, con envío si no llega al umbral', () => {
    S().addItem(product, 'M', 'Negro', 2); // 160.000
    expect(S().getTotals()).toMatchObject({ rawSubtotal: 160000, couponDiscount: 0, shippingCost: 12000, total: 172000, isEstimate: true, hasFreeShipping: false });
    expect(S().getTotals().amountForFreeShipping).toBe(40000);
  });
  it('envío gratis al alcanzar el umbral', () => {
    S().addItem(product, 'M', 'Negro', 3); // 240.000
    expect(S().getTotals()).toMatchObject({ shippingCost: 0, total: 240000, hasFreeShipping: true, amountForFreeShipping: 0 });
  });
  it('carrito vacío: todo en cero y no se puede pagar', () => {
    expect(S().getTotals()).toMatchObject({ rawSubtotal: 0, shippingCost: 0, total: 0, canCheckout: false });
  });
  it('un descuento de cupón se resta y puede quitar el envío gratis', () => {
    S().addItem(product, 'M', 'Negro', 3); // 240.000
    store.setState({ appliedCoupon: { code: 'X', discountAmount: 50000, freeShipping: false } });
    expect(S().getTotals()).toMatchObject({ couponDiscount: 50000, subtotal: 190000, shippingCost: 12000, total: 202000 });
  });
  it('el descuento nunca supera el subtotal; cupón de envío gratis anula el envío', () => {
    S().addItem(product, 'M', 'Negro', 1); // 80.000
    store.setState({ appliedCoupon: { code: 'X', discountAmount: 999999, freeShipping: true } });
    expect(S().getTotals()).toMatchObject({ couponDiscount: 80000, subtotal: 0, shippingCost: 0, total: 0 });
  });
  it('la cotización de la BD manda si corresponde al carrito actual y se descarta si el carrito cambió', () => {
    S().addItem(product, 'M', 'Negro', 1);
    const signature = 'v-m-negx1';
    store.setState({ quote: { signature, subtotal: 80000, discount_total: 8000, shipping_cost: 12000, total: 84000, can_checkout: true, lines: [] } });
    expect(S().getTotals()).toMatchObject({ isEstimate: false, total: 84000, couponDiscount: 8000 });
    S().addItem(product, 'M', 'Negro', 1); // cambia la firma
    expect(S().getTotals().isEstimate).toBe(true);
  });
});

describe('cupones', () => {
  beforeEach(() => S().addItem(product, 'M', 'Negro', 2));
  it('aplica un cupón válido con el descuento que calcula la BD y envía el subtotal real', async () => {
    supa.state.rpc.validate_coupon = { data: { valid: true, code: 'JM10', discount_amount: 16000, free_shipping: false }, error: null };
    const r = await S().applyCoupon('JM10', 'a@b.co');
    expect(r.success).toBe(true);
    expect(supa.rpc).toHaveBeenCalledWith('validate_coupon', { p_code: 'JM10', p_subtotal: 160000, p_email: 'a@b.co' });
    expect(S().appliedCoupon).toEqual({ code: 'JM10', discountAmount: 16000, freeShipping: false });
  });
  it.each([
    ['EXPIRED', /vencido/], ['NOT_FOUND', /no existe/], ['EXHAUSTED', /límite de usos/], ['MIN_SUBTOTAL', /mínimo/], ['EMAIL_LIMIT', /máximo de veces/],
  ])('cupón inválido (%s) no se aplica y explica el motivo', async (reason, msg) => {
    supa.state.rpc.validate_coupon = { data: { valid: false, reason }, error: null };
    const r = await S().applyCoupon('MAL');
    expect(r.success).toBe(false);
    expect(r.message).toMatch(msg);
    expect(S().appliedCoupon).toBeNull();
  });
  it('un fallo de red no aplica el cupón y devuelve un mensaje legible', async () => {
    supa.state.rpc.validate_coupon = { data: null, error: { message: 'TypeError: Failed to fetch' } };
    const r = await S().applyCoupon('JM10');
    expect(r).toMatchObject({ success: false });
    expect(r.message).toMatch(/conexión/);
  });
  it('removeCoupon limpia cupón y cotización', () => {
    store.setState({ appliedCoupon: { code: 'X', discountAmount: 1, freeShipping: false }, quote: { signature: 's' } });
    S().removeCoupon();
    expect(S().appliedCoupon).toBeNull();
    expect(S().quote).toBeNull();
  });
});

describe('validación del formulario de checkout', () => {
  const ok = { firstName: 'Juan', lastName: 'Pérez', email: 'juan@correo.co', phone: '300 123 4567', department: 'Antioquia', city: 'Medellín', address: 'Calle 10 # 5-20' };
  it('datos completos → sin errores', () => expect(validateCheckout(ok)).toEqual({}));
  it('detecta cada campo inválido', () => {
    const e = validateCheckout({ firstName: 'J', lastName: '', email: 'sin-arroba', phone: '123', department: '', city: 'M', address: 'ab' });
    expect(Object.keys(e).sort()).toEqual(['address', 'city', 'department', 'email', 'firstName', 'lastName', 'phone']);
  });
  it('teléfono: 7–15 dígitos ignorando símbolos', () => {
    expect(validateCheckout({ ...ok, phone: '+57 (300) 123-4567' }).phone).toBeUndefined();
    expect(validateCheckout({ ...ok, phone: '1234567890123456' }).phone).toBeDefined();
    expect(validateCheckout({ ...ok, phone: '123456' }).phone).toBeDefined();
  });
  it('los espacios no cuentan como contenido', () => {
    expect(validateCheckout({ ...ok, address: '   a   ' }).address).toBeDefined();
  });
});

describe('creación de pedido y prevención de duplicados', () => {
  const input = { customer: { name: 'Juan', email: 'j@c.co', phone: '3001234567' }, shipping: { department: 'Antioquia', city: 'Medellín', address: 'Calle 1 2-3' }, idempotencyKey: 'web-k1' };
  const rpcOrder = (dup = false) => ({ data: { order_id: 'o1', order_number: 'JM-000001', public_token: 'tok', status: 'payment_pending', total: 172000, amount_in_cents: 17200000, payment_expires_at: null, is_duplicate: dup }, error: null });
  beforeEach(() => S().addItem(product, 'M', 'Negro', 2));

  it('envía solo variante y cantidad (los precios los fija la BD) junto con la clave de idempotencia', async () => {
    supa.state.rpc.create_order = rpcOrder();
    await S().createOrder(input);
    const [, args] = supa.rpc.mock.calls.find(([n]) => n === 'create_order');
    expect(args.p_items).toEqual([{ variant_id: 'v-m-neg', quantity: 2 }]);
    expect(args.p_idempotency_key).toBe('web-k1');
    expect(JSON.stringify(args)).not.toMatch(/80000|price/);
  });
  it('conserva el carrito hasta que el pago se confirma y registra el pedido activo', async () => {
    supa.state.rpc.create_order = rpcOrder();
    const o = await S().createOrder(input);
    expect(o).toMatchObject({ id: 'o1', total: 172000 });
    expect(S().items).toHaveLength(1);
    expect(S().activeCheckoutOrderId).toBe('o1');
  });
  it('repetir el mismo intento (misma clave) no duplica el pedido local', async () => {
    supa.state.rpc.create_order = rpcOrder();
    await S().createOrder(input);
    supa.state.rpc.create_order = rpcOrder(true);
    const again = await S().createOrder(input);
    expect(again.isDuplicate).toBe(true);
    expect(S().orders.filter((o) => o.id === 'o1')).toHaveLength(1);
  });
  it('la clave de idempotencia cambia solo si cambia el carrito o el cupón', () => {
    const a = [{ variantId: 'a', quantity: 1 }, { variantId: 'b', quantity: 2 }];
    expect(cartKeyOf(a, null)).toBe(cartKeyOf([...a].reverse(), null));
    expect(cartKeyOf(a, null)).not.toBe(cartKeyOf([{ variantId: 'a', quantity: 2 }, a[1]], null));
    expect(cartKeyOf(a, null)).not.toBe(cartKeyOf(a, { code: 'JM10' }));
  });
  it('newIdempotencyKey genera claves únicas con prefijo', () => {
    const k = new Set(Array.from({ length: 50 }, () => orderSvc.newIdempotencyKey()));
    expect(k.size).toBe(50);
    expect([...k][0]).toMatch(/^web-/);
  });
  it.each([
    ['JM_OUT_OF_STOCK', /stock/i], ['JM_INVALID_EMAIL', /correo/i], ['JM_INVALID_PHONE', /teléfono/i], ['JM_EMPTY_CART', /vacío/i],
  ])('errores de la BD (%s) se traducen y el carrito no se pierde', async (hint, msg) => {
    supa.state.rpc.create_order = { data: null, error: { hint, message: 'Stock insuficiente: Camiseta M/Negro (quedan 1)' } };
    await expect(S().createOrder(input)).rejects.toThrow(msg);
    expect(S().items).toHaveLength(1);
    expect(S().activeCheckoutOrderId).toBeNull();
  });
  it('pago aprobado: el carrito se vacía solo para el pedido del checkout en curso', async () => {
    supa.state.rpc.create_order = rpcOrder();
    await S().createOrder(input);
    expect(S().finalizePaidOrder('otro-pedido')).toBe(false);
    expect(S().items).toHaveLength(1);
    expect(S().finalizePaidOrder('o1')).toBe(true);
    expect(S().items).toHaveLength(0);
    expect(S().finalizePaidOrder('o1')).toBe(false); // idempotente
  });
});
