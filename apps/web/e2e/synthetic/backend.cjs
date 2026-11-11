// Backend SINTÉTICO para E2E sin Docker (M33). NO es Supabase ni Wompi: emula, con datos ficticios y en memoria, el
// subconjunto de PostgREST/GoTrue que usa la tienda, siguiendo los contratos del esquema M24 (RPC quote_cart,
// validate_coupon, create_order, admin_*). Las reglas de negocio reales (RLS, máquina de estados, stock) están
// verificadas por pgTAP contra PostgreSQL real; aquí solo se ejercita el navegador. Escucha solo en 127.0.0.1.
const http = require('http');
const crypto = require('crypto');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (sub, role) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: 4102444800, jm: role })}.synthetic`;

function seed() {
  const colors = { negro: { id: 'c-neg', slug: 'negro', name: 'Negro', hex_code: '#111111' }, blanco: { id: 'c-bla', slug: 'blanco', name: 'Blanco', hex_code: '#FFFFFF' } };
  const sizes = { S: { code: 'S', sort_order: 1 }, M: { code: 'M', sort_order: 2 }, L: { code: 'L', sort_order: 3 } };
  const cat = { id: 'cat-cam', slug: 'camisetas', name: 'Camisetas', size_group: 'alpha', sort_order: 1, is_active: true };
  const line = { id: 'sl-urb', slug: 'urbana', name: 'Urbana', tagline: 'Casual urbano', sort_order: 1, is_active: true };
  const mk = (id, ref, slug, name, price, vs) => ({
    id, reference: ref, slug, name, description: `${name} de algodón (dato sintético).`, details: ['100% algodón'], fit: 'REGULAR', fit_description: 'Corte regular',
    base_price: price, compare_at_price: null, status: 'active', is_featured_new: true, is_bestseller: false, published_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
    categories: cat, style_lines: { id: line.id, slug: line.slug, name: line.name }, brands: { id: 'b1', name: 'J&M' },
    product_colors: [{ color_id: 'c-neg', position: 1, is_default: true, colors: colors.negro }, { color_id: 'c-bla', position: 2, is_default: false, colors: colors.blanco }],
    product_images: [{ id: `${id}-i1`, color_id: null, storage_path: null, external_url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="%23ddd"/></svg>', alt_text: name, position: 1 }],
    variants: vs.map((v) => ({ id: v.id, sku: v.sku, color_id: v.color, price_override: null, is_active: true, sizes: sizes[v.size] })),
    product_occasions: [],
  });
  const vsA = [
    { id: 'va-m-neg', sku: 'CAM-M-NEG', color: 'c-neg', size: 'M', stock: 5 }, { id: 'va-l-neg', sku: 'CAM-L-NEG', color: 'c-neg', size: 'L', stock: 1 },
    { id: 'va-m-bla', sku: 'CAM-M-BLA', color: 'c-bla', size: 'M', stock: 0 }, { id: 'va-s-bla', sku: 'CAM-S-BLA', color: 'c-bla', size: 'S', stock: 3 },
  ];
  const vsB = [{ id: 'vb-m-neg', sku: 'POL-M-NEG', color: 'c-neg', size: 'M', stock: 10 }];
  const products = [mk('p-cam', 'CAM-001', 'camiseta-basica', 'Camiseta Básica', 80000, vsA), mk('p-pol', 'POL-001', 'polo-clasico', 'Polo Clásico', 120000, vsB)];
  const oficina = { id: 'oc-ofi', slug: 'oficina', name: 'Oficina', is_active: true, sort_order: 1 };
  products[1].product_occasions = [{ occasions: { slug: oficina.slug, name: oficina.name } }];
  const inventories = [...vsA.map((v) => ({ v, p: products[0] })), ...vsB.map((v) => ({ v, p: products[1] }))].map(({ v, p }, i) => ({
    id: `inv-${i}`, variant_id: v.id, branch_id: 'br1', stock: v.stock, reserved: 0, min_stock: 2, location_shelf: null, updated_at: `2026-01-0${i + 1}T00:00:00Z`,
    variants: { id: v.id, sku: v.sku, is_active: true, color_id: v.color, sizes: { code: v.size }, products: { id: p.id, name: p.name, reference: p.reference, status: 'active', product_colors: p.product_colors } },
  }));
  const adminId = 'u-admin';
  return {
    users: [{ id: adminId, email: 'admin@jm.test', password: 'Admin-Sintetico-1', role: 'admin', full_name: 'Admin Sintético' }],
    products, inventories,
    tables: {
      categories: [cat], style_lines: [line], occasions: [oficina], colors: Object.values(colors), sizes: [], brands: [{ id: 'b1', name: 'J&M' }], site_content: [],
      // Look activo para «Completa el look» (portada y ficha): camiseta con varias tallas/colores + polo de talla única disponible.
      collections: [{ id: 'col-look', slug: 'look-oficina', name: 'Look Oficina', subtitle: 'Para la semana', image_url: null, kind: 'look', is_active: true, sort_order: 1,
        collection_products: [{ product_id: 'p-cam', position: 1 }, { product_id: 'p-pol', position: 2 }] }],
      product_reviews: [], coupons: [], customer_addresses: [], wishlist_items: [],
      shipping_methods: [{ code: 'standard', name: 'Estándar', cost: 12000, free_over_subtotal: 200000, eta_text: '3-5 días', sort_order: 1, is_active: true }],
      v_product_rating: [], online_orders: [], newsletter_subscribers: [], profiles: [{ id: adminId, role: 'admin', full_name: 'Admin Sintético', email: 'admin@jm.test' }],
    },
    coupons: { JM10: { pct: 10, min: 50000 } },
    idem: new Map(), seq: 0,
  };
}

const TRANSITIONS = { payment_pending: ['cancelled'], paid: ['processing', 'cancelled'], processing: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [] };

function start(port = 54321) {
  let S = seed();
  const variantIndex = () => new Map(S.inventories.map((i) => [i.variant_id, i]));
  const avail = (inv) => inv.stock - inv.reserved;
  const err = (code, message, hint) => ({ __status: 400, body: { code, message, hint, details: null } });

  const price = (variantId) => (S.products.find((p) => p.variants.some((v) => v.id === variantId)) || {}).base_price;
  function quote(items, couponCode, method) {
    const idx = variantIndex();
    let subtotal = 0; let canCheckout = true; const lines = [];
    for (const it of items) {
      const inv = idx.get(it.variant_id);
      if (!inv) return err('P0001', 'variante inexistente', 'JM_VARIANT_NOT_FOUND');
      const unit = price(it.variant_id);
      const ok = avail(inv) >= it.quantity; if (!ok) canCheckout = false;
      lines.push({ variant_id: it.variant_id, product_name: inv.variants.products.name, sku: inv.variants.sku, size_code: inv.variants.sizes.code,
        color_name: inv.variants.products.product_colors.find((pc) => pc.color_id === inv.variants.color_id).colors.name, image_url: null,
        unit_price: unit, quantity: it.quantity, line_total: unit * it.quantity, available: avail(inv), in_stock: ok });
      subtotal += unit * it.quantity;
    }
    let discount = 0; let free = false; let coupon = null;
    if (couponCode) { const r = validateCoupon(couponCode, subtotal); coupon = r; if (r.valid) { discount = r.discount_amount; free = r.free_shipping; } }
    const net = subtotal - discount;
    const sm = S.tables.shipping_methods.find((m) => m.code === method) || S.tables.shipping_methods[0];
    const shipping = free || (sm.free_over_subtotal && net >= sm.free_over_subtotal) ? 0 : sm.cost;
    return { subtotal, discount_total: discount, shipping_cost: shipping, total: net + shipping, can_checkout: canCheckout, coupon, lines };
  }
  function validateCoupon(code, subtotal) {
    const c = S.coupons[String(code || '').trim().toUpperCase()];
    if (!code || !String(code).trim()) return { valid: false, reason: 'EMPTY' };
    if (!c) return { valid: false, reason: 'NOT_FOUND' };
    if (subtotal < c.min) return { valid: false, reason: 'MIN_SUBTOTAL' };
    return { valid: true, code: String(code).trim().toUpperCase(), discount_amount: Math.floor(subtotal * c.pct / 100), free_shipping: false };
  }

  const rpc = {
    // Ejecución 67: espejo de la migración 20261111140000 (idempotente, normaliza, misma respuesta si ya existía).
    subscribe_newsletter: (a, ctx) => {
      const e = String(a.p_email || '').trim();
      if (e.length < 3 || e.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return err('P0001', 'Correo electrónico inválido', 'JM_INVALID_EMAIL');
      const list = S.tables.newsletter_subscribers; const norm = e.toLowerCase();
      const row = list.find((x) => x.email_normalized === norm);
      if (row) { if (row.unsubscribed_at) row.subscribed_at = new Date().toISOString(); row.unsubscribed_at = null; return { ok: true }; }
      const now = new Date().toISOString();
      list.push({ id: crypto.randomUUID(), email: e, email_normalized: norm, source: /^[a-z0-9_]{1,32}$/.test(a.p_source || '') ? a.p_source : 'home', user_id: ctx.userId || null, subscribed_at: now, unsubscribed_at: null, created_at: now });
      return { ok: true };
    },
    // Ejecución 70: espejo de la migración 20261111160000 (boletín del correo de LA CUENTA; usuarios sintéticos = confirmados).
    my_newsletter_subscription: (a, ctx) => {
      const u = S.users.find((x) => x.id === ctx.userId);
      if (!u) return err('P0001', 'Inicia sesión para gestionar el boletín', 'JM_AUTH_REQUIRED');
      const email = String(u.email).trim().toLowerCase();
      const row = S.tables.newsletter_subscribers.find((x) => x.email_normalized === email);
      if (row) return { email, subscribed: !row.unsubscribed_at, on_list: true, subscribed_at: row.subscribed_at, unsubscribed_at: row.unsubscribed_at };
      const prof = S.tables.profiles.find((x) => x.id === u.id);
      return { email, subscribed: !!prof?.marketing_opt_in, on_list: false, subscribed_at: null, unsubscribed_at: null };
    },
    set_my_newsletter_subscription: (a, ctx) => {
      const u = S.users.find((x) => x.id === ctx.userId);
      if (!u) return err('P0001', 'Inicia sesión para gestionar el boletín', 'JM_AUTH_REQUIRED');
      if (typeof a.p_subscribed !== 'boolean') return err('P0001', 'Indica si quieres recibir el boletín', 'JM_INVALID_INPUT');
      const email = String(u.email).trim().toLowerCase(); const now = new Date().toISOString();
      const list = S.tables.newsletter_subscribers; const row = list.find((x) => x.email_normalized === email);
      if (a.p_subscribed) {
        if (row) { if (row.unsubscribed_at) row.subscribed_at = now; row.unsubscribed_at = null; row.user_id = row.user_id || u.id; }
        else list.push({ id: crypto.randomUUID(), email, email_normalized: email, source: 'account', user_id: u.id, subscribed_at: now, unsubscribed_at: null, created_at: now });
      } else if (row && !row.unsubscribed_at) row.unsubscribed_at = now;
      const prof = S.tables.profiles.find((x) => x.id === u.id); if (prof) prof.marketing_opt_in = a.p_subscribed;
      return rpc.my_newsletter_subscription({}, ctx);
    },
    // Ejecución 71: espejo de la migración 20261111180000 (reseñas del comprador, quedan pendientes).
    my_product_reviewables: (a, ctx) => {
      if (!ctx.userId) return err('P0001', 'Inicia sesión para opinar', 'JM_AUTH_REQUIRED');
      return S.tables.online_orders.filter((o) => o.user_id === ctx.userId && ['paid', 'processing', 'shipped', 'delivered'].includes(o.status))
        .flatMap((o) => o.online_order_items.filter((i) => i.product_id === a.p_product_id).map((i) => {
          const r = S.tables.product_reviews.find((x) => x.order_item_id === i.id);
          return { order_item_id: i.id, order_number: o.order_number, purchased_at: o.paid_at || o.created_at, size_code: i.size_code, color_name: i.color_name,
            review: r ? { id: r.id, status: r.status, rating: r.rating, title: r.title, comment: r.comment, admin_reply: r.admin_reply, created_at: r.created_at } : null };
        }));
    },
    submit_product_review: (a, ctx) => {
      if (!ctx.userId) return err('P0001', 'Inicia sesión para opinar', 'JM_AUTH_REQUIRED');
      const t = String(a.p_title || '').trim(); const c = String(a.p_comment || '').trim(); const city = String(a.p_city || '').trim() || null;
      if (!Number.isInteger(a.p_rating) || a.p_rating < 1 || a.p_rating > 5) return err('P0001', 'Elige una calificación de 1 a 5 estrellas', 'JM_INVALID_INPUT');
      if (t.length < 3 || t.length > 120) return err('P0001', 'El título debe tener entre 3 y 120 caracteres', 'JM_INVALID_INPUT');
      if (c.length < 10 || c.length > 2000) return err('P0001', 'El comentario debe tener entre 10 y 2000 caracteres', 'JM_INVALID_INPUT');
      const o = S.tables.online_orders.find((x) => x.user_id === ctx.userId && ['paid', 'processing', 'shipped', 'delivered'].includes(x.status)
        && x.online_order_items.some((i) => i.id === a.p_order_item_id));
      if (!o) return err('P0001', 'Solo puedes opinar sobre productos que compraste', 'JM_NOT_PURCHASED');
      if (S.tables.product_reviews.some((x) => x.order_item_id === a.p_order_item_id)) return err('P0001', 'Ya opinaste sobre esta compra', 'JM_ALREADY_REVIEWED');
      const item = o.online_order_items.find((i) => i.id === a.p_order_item_id);
      const parts = String(S.tables.profiles.find((x) => x.id === ctx.userId)?.full_name || '').trim().split(/\s+/).filter(Boolean);
      const author = parts.length === 0 ? 'Cliente J&M' : parts.length === 1 ? parts[0] : `${parts[0]} ${parts[1][0].toUpperCase()}.`;
      const row = { id: crypto.randomUUID(), product_id: item.product_id, order_item_id: item.id, user_id: ctx.userId, author_name: author, city, rating: a.p_rating,
        title: t, comment: c, is_verified_buyer: true, status: 'pending', admin_reply: null, created_at: new Date().toISOString() };
      S.tables.product_reviews.push(row);
      return { id: row.id, status: 'pending', product_id: row.product_id };
    },
    // Ejecución 72: espejo de my_review_invitations (migración 20261111200000): pedidos entregados, sin reseña propia del producto.
    my_review_invitations: (a, ctx) => {
      if (!ctx.userId) return err('P0001', 'Inicia sesión para opinar', 'JM_AUTH_REQUIRED');
      const seen = new Set();
      return S.tables.online_orders.filter((o) => o.user_id === ctx.userId && o.status === 'delivered')
        .flatMap((o) => o.online_order_items.map((i) => ({ o, i })))
        .filter(({ i }) => !S.tables.product_reviews.some((r) => r.product_id === i.product_id && r.user_id === ctx.userId))
        .filter(({ i }) => (seen.has(i.product_id) ? false : (seen.add(i.product_id), true)))
        .map(({ o, i }) => ({ order_item_id: i.id, order_number: o.order_number, delivered_at: o.delivered_at, product_id: i.product_id,
          product_name: i.product_name, slug: (S.products.find((x) => x.id === i.product_id) || {}).slug, image_url: i.image_url || null,
          size_code: i.size_code, color_name: i.color_name }));
    },
    quote_cart: (a) => quote(a.p_items || [], a.p_coupon_code, a.p_shipping_method),
    validate_coupon: (a) => validateCoupon(a.p_code, a.p_subtotal),
    get_order_status_catalog: () => ({
      statuses: Object.keys(TRANSITIONS).map((st) => ({ status: st, label: st, description: st })),
      transitions: Object.entries(TRANSITIONS).flatMap(([from, tos]) => tos.map((to) => ({ from, to, actor: 'admin', requires_note: to === 'cancelled' }))),
    }),
    create_order: (a, ctx) => {
      const items = a.p_items || [];
      if (!items.length) return err('P0001', 'carrito vacío', 'JM_EMPTY_CART');
      const c = a.p_customer || {}; const sh = a.p_shipping || {};
      if (!c.name || c.name.trim().length < 2) return err('P0001', 'nombre', 'JM_INVALID_CUSTOMER');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email || '')) return err('P0001', 'correo', 'JM_INVALID_EMAIL');
      const digits = String(c.phone || '').replace(/\D/g, ''); if (digits.length < 7 || digits.length > 15) return err('P0001', 'tel', 'JM_INVALID_PHONE');
      if (!sh.department || !sh.city || !sh.address) return err('P0001', 'envío', 'JM_INVALID_SHIPPING');
      if (!a.p_idempotency_key) return err('P0001', 'clave', 'JM_IDEMPOTENCY_KEY');
      if (S.idem.has(a.p_idempotency_key)) return { ...S.idem.get(a.p_idempotency_key), is_duplicate: true };
      const q = quote(items, a.p_coupon_code, a.p_shipping_method);
      if (q.__status) return q;
      const idx = variantIndex();
      for (const l of q.lines) if (!l.in_stock) return err('P0001', `Stock insuficiente: ${l.variant_id} (quedan ${l.available})`, 'JM_OUT_OF_STOCK');
      for (const it of items) idx.get(it.variant_id).reserved += it.quantity;
      const n = ++S.seq; const id = `o-${n}`; const num = `JM-${String(n).padStart(6, '0')}`;
      const pub = crypto.randomBytes(8).toString('hex');
      const order = {
        id, order_number: num, public_token: pub, user_id: ctx.userId || null, customer_name: c.name, customer_email: c.email, customer_phone: c.phone, customer_document: null,
        shipping_department: sh.department, shipping_city: sh.city, shipping_address: sh.address, shipping_neighborhood: sh.neighborhood || null, shipping_notes: sh.notes || null,
        shipping_method_code: a.p_shipping_method, subtotal: q.subtotal, discount_total: q.discount_total, shipping_cost: q.shipping_cost, total: q.total, coupon_code: a.p_coupon_code || null,
        status: 'payment_pending', created_at: new Date().toISOString(), payment_expires_at: new Date(Date.now() + 3600e3).toISOString(), paid_at: null, needs_attention: false, carrier: null, tracking_number: null, tracking_url: null, shipped_at: null, delivered_at: null,
        online_order_items: q.lines.map((l) => { const p = S.products.find((x) => x.variants.some((v) => v.id === l.variant_id)); const v = p.variants.find((x) => x.id === l.variant_id);
          const inv = idx.get(l.variant_id); return { id: crypto.randomUUID(), product_id: p.id, product_name: p.name, sku: v.sku, size_code: v.sizes.code, color_name: inv.variants.products.product_colors.find((pc) => pc.color_id === v.color_id).colors.name, unit_price: l.unit_price, quantity: l.quantity, line_total: l.line_total, image_url: null, variant_id: l.variant_id }; }),
        payment_transactions: [], order_events: [{ event_type: 'created', from_status: null, to_status: 'payment_pending', actor: 'cliente', note: null, created_at: new Date().toISOString() }],
      };
      S.tables.online_orders.unshift(order);
      const res = { order_id: id, order_number: num, public_token: pub, status: order.status, total: order.total, amount_in_cents: order.total * 100, payment_expires_at: order.payment_expires_at, is_duplicate: false };
      S.idem.set(a.p_idempotency_key, res);
      return res;
    },
    get_order_public: (a) => { const o = S.tables.online_orders.find((x) => x.order_number === a.p_order_number && x.public_token === a.p_public_token); return o ? { id: o.id, order_number: o.order_number, status: o.status, payment_expires_at: o.payment_expires_at, customer_name: o.customer_name, customer_email: o.customer_email, shipping: { department: o.shipping_department, city: o.shipping_city, address: o.shipping_address, neighborhood: o.shipping_neighborhood, method: o.shipping_method_code }, total: o.total, subtotal: o.subtotal, shipping_cost: o.shipping_cost, discount_total: o.discount_total, items: o.online_order_items, created_at: o.created_at } : null; },
    cancel_my_order: (a) => {
      const o = S.tables.online_orders.find((x) => x.id === a.p_order_id && (x.public_token === a.p_public_token));
      if (!o) return err('P0001', 'no existe', 'JM_ORDER_NOT_FOUND');
      if (!['payment_pending'].includes(o.status)) return err('P0001', 'estado', 'JM_INVALID_TRANSITION');
      transition(o, 'cancelled', 'cliente'); return { status: 'cancelled' };
    },
    admin_transition_order: (a, ctx) => {
      if (ctx.role !== 'admin') return err('42501', 'permission denied', 'JM_FORBIDDEN');
      const o = S.tables.online_orders.find((x) => x.id === a.p_order_id); if (!o) return err('P0001', 'x', 'JM_ORDER_NOT_FOUND');
      if (!(TRANSITIONS[o.status] || []).includes(a.p_to)) return err('P0001', 'x', 'JM_INVALID_TRANSITION');
      if (a.p_to === 'shipped') { if (!a.p_tracking || !a.p_tracking.carrier || !a.p_tracking.tracking_number) return err('P0001', 'x', 'JM_TRACKING_REQUIRED'); o.carrier = a.p_tracking.carrier; o.tracking_number = a.p_tracking.tracking_number; }
      transition(o, a.p_to, 'admin', a.p_note); return { status: a.p_to };
    },
    admin_adjust_inventory: (a, ctx) => {
      if (ctx.role !== 'admin') return err('42501', 'permission denied', 'JM_FORBIDDEN');
      const inv = S.inventories.find((i) => i.variant_id === a.p_variant_id); if (!inv) return err('P0001', 'x', 'JM_VARIANT_NOT_FOUND');
      if (!a.p_reason || !String(a.p_reason).trim()) return err('P0001', 'x', 'JM_NOTE_REQUIRED');
      if (inv.stock + a.p_quantity_change < inv.reserved) return err('P0001', 'x', 'JM_BELOW_RESERVED');
      inv.stock += a.p_quantity_change; return { stock: inv.stock };
    },
    admin_dashboard_metrics: (a, ctx) => {
      if (ctx.role !== 'admin') return err('42501', 'permission denied', 'JM_FORBIDDEN');
      const os = S.tables.online_orders; const paid = os.filter((o) => ['paid', 'processing', 'shipped', 'delivered'].includes(o.status));
      const by = {}; for (const o of os) by[o.status] = (by[o.status] || 0) + 1;
      return { gross_sales: paid.reduce((n, o) => n + o.total, 0), paid_orders: paid.length, average_ticket: paid.length ? Math.round(paid.reduce((n, o) => n + o.total, 0) / paid.length) : 0,
        units_sold: paid.reduce((n, o) => n + o.online_order_items.reduce((m, i) => m + i.quantity, 0), 0), low_stock_variants: S.inventories.filter((i) => avail(i) <= i.min_stock).length, needs_attention: 0, orders_by_status: by, total_orders: os.length };
    },
  };
  function transition(o, to, actor, note) {
    const from = o.status; o.status = to; if (to === 'cancelled') for (const it of o.online_order_items) { const inv = S.inventories.find((i) => i.variant_id === it.variant_id); if (inv) inv.reserved = Math.max(0, inv.reserved - it.quantity); }
    if (to === 'paid') o.paid_at = new Date().toISOString();
    if (to === 'delivered') o.delivered_at = new Date().toISOString();
    o.order_events.unshift({ event_type: 'status', from_status: from, to_status: to, actor, note: note || null, created_at: new Date().toISOString() });
  }

  function rows(table, q, ctx) {
    let data;
    if (table === 'products') data = S.products;
    else if (table === 'inventories') data = ctx.role === 'admin' ? S.inventories : [];
    else if (table === 'v_variant_availability') data = S.inventories.map((i) => ({ variant_id: i.variant_id, product_id: i.variants.products.id, available: avail(i) }));
    else if (table === 'online_orders') data = ctx.role === 'admin' ? S.tables.online_orders : S.tables.online_orders.filter((o) => ctx.userId && o.user_id === ctx.userId);
    else if (table === 'profiles') data = ctx.role === 'admin' ? S.tables.profiles : S.tables.profiles.filter((p) => p.id === ctx.userId);
    else if (table === 'newsletter_subscribers') data = ctx.role === 'admin' ? S.tables.newsletter_subscribers : []; // RLS newsletter_admin_read
    else if (table === 'product_reviews') data = ctx.role === 'admin' ? S.tables.product_reviews : S.tables.product_reviews.filter((r) => r.status === 'approved'); // RLS product_reviews_read
    else if (table === 'customer_addresses') data = ctx.role === 'admin' ? S.tables.customer_addresses : S.tables.customer_addresses.filter((a) => ctx.userId && a.user_id === ctx.userId);
    else data = S.tables[table] || [];
    for (const [k, v] of Object.entries(q)) {
      if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
      if (k === 'or') { // solo la forma que usa el admin: (col.ilike.*texto*,col2.ilike.*texto*)
        const conds = v.replace(/^\(|\)$/g, '').split(',').map((c) => /^([a-z_]+)\.ilike\.\*(.*)\*$/.exec(c)).filter(Boolean);
        data = data.filter((r) => conds.some(([, col, t]) => String(r[col] ?? '').toLowerCase().includes(t.toLowerCase())));
        continue;
      }
      const m = /^(eq|in|neq)\.(.*)$/.exec(v); if (!m) continue;
      if (m[1] === 'eq') data = data.filter((r) => String(r[k]) === m[2]);
      else if (m[1] === 'neq') data = data.filter((r) => String(r[k]) !== m[2]);
      else { const set = m[2].replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')); data = data.filter((r) => set.includes(String(r[k]))); }
    }
    return data;
  }

  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'Access-Control-Expose-Headers': '*' };
  const send = (res, status, body, extra = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...cors, ...extra }); res.end(body === undefined ? '' : JSON.stringify(body)); };
  const session = (u) => ({ access_token: token(u.id, u.role), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `r-${u.id}`,
    user: { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: {}, user_metadata: { full_name: u.full_name }, created_at: '2026-01-01T00:00:00Z' } });
  const ctxOf = (req) => { const m = /Bearer ([^\s]+)/.exec(req.headers.authorization || ''); if (!m) return {}; try { const p = JSON.parse(Buffer.from(m[1].split('.')[1], 'base64url')); const u = S.users.find((x) => x.id === p.sub); return u ? { userId: u.id, role: u.role } : {}; } catch { return {}; } };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x'); const q = Object.fromEntries(url.searchParams); const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (req.method === 'OPTIONS') return send(res, 204);
      let body = {}; try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}; } catch { /* binario */ }
      const p = url.pathname; const ctx = ctxOf(req);
      try {
        if (p === '/__health') return send(res, 200, { ok: true });
        if (p === '/__reset') { S = seed(); return send(res, 200, { ok: true }); }
        if (p === '/__state') return send(res, 200, { orders: S.tables.online_orders, newsletter: S.tables.newsletter_subscribers, reviews: S.tables.product_reviews, inventories: S.inventories.map((i) => ({ sku: i.variants.sku, stock: i.stock, reserved: i.reserved })) });
        // Simula la confirmación del webhook de pago. NO es Wompi: solo mueve el pedido a "paid" para probar lo que sigue.
        // Ejecución 59: ventana de pago vencida sin que el job de expiración haya pasado (estado sigue payment_pending).
        if (p.startsWith('/__synthetic-expire-window/')) { const o = S.tables.online_orders.find((x) => x.order_number === p.split('/').pop()); if (!o) return send(res, 404, {}); o.payment_expires_at = new Date(Date.now() - 60e3).toISOString(); return send(res, 200, { payment_expires_at: o.payment_expires_at }); }
        // Ejecución 72: entrega SINTÉTICA (paid → processing → shipped → delivered), para probar lo que sigue a la entrega.
        if (p.startsWith('/__synthetic-mark-delivered/')) { const o = S.tables.online_orders.find((x) => x.order_number === p.split('/').pop()); if (!o || o.status !== 'paid') return send(res, 404, {}); for (const st of ['processing', 'shipped', 'delivered']) transition(o, st, 'sintético'); return send(res, 200, { status: o.status }); }
        if (p.startsWith('/__synthetic-mark-paid/')) { const o = S.tables.online_orders.find((x) => x.order_number === p.split('/').pop()); if (!o) return send(res, 404, {}); for (const it of o.online_order_items) { const inv = S.inventories.find((i) => i.variant_id === it.variant_id); inv.reserved -= it.quantity; inv.stock -= it.quantity; } transition(o, 'paid', 'sintético'); return send(res, 200, { status: 'paid' }); }
        if (p === '/auth/v1/signup') {
          if (S.users.some((u) => u.email === body.email)) return send(res, 422, { code: 'user_already_exists', msg: 'User already registered', message: 'User already registered' });
          const u = { id: `u-${crypto.randomBytes(4).toString('hex')}`, email: body.email, password: body.password, role: 'customer', full_name: body.data?.full_name || '' };
          S.users.push(u); S.tables.profiles.push({ id: u.id, role: 'customer', full_name: u.full_name, email: u.email }); return send(res, 200, session(u));
        }
        if (p === '/auth/v1/token') {
          if (q.grant_type === 'password') { const u = S.users.find((x) => x.email === body.email && x.password === body.password); return u ? send(res, 200, session(u)) : send(res, 400, { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials', message: 'Invalid login credentials' }); }
          if (q.grant_type === 'refresh_token') { const u = S.users.find((x) => `r-${x.id}` === body.refresh_token); return u ? send(res, 200, session(u)) : send(res, 400, { msg: 'Invalid Refresh Token', message: 'Invalid Refresh Token' }); }
        }
        // Ejecución 57: cambio de contraseña con sesión (mismo contrato que GoTrue: 422 same_password / weak_password).
        if (p === '/auth/v1/user' && req.method === 'PUT') {
          const u = S.users.find((x) => x.id === ctx.userId); if (!u) return send(res, 401, { code: 'no_authorization', msg: 'invalid token', message: 'invalid token' });
          if (body.password !== undefined) {
            if (String(body.password).length < 8) return send(res, 422, { code: 'weak_password', msg: 'Password should be at least 8 characters.', message: 'Password should be at least 8 characters.' });
            if (body.password === u.password) return send(res, 422, { code: 'same_password', msg: 'New password should be different from the old password.', message: 'New password should be different from the old password.' });
            u.password = body.password;
          }
          return send(res, 200, session(u).user);
        }
        if (p === '/auth/v1/user') { const u = S.users.find((x) => x.id === ctx.userId); return u ? send(res, 200, session(u).user) : send(res, 401, { msg: 'invalid token' }); }
        if (p === '/auth/v1/logout') return send(res, 204);
        if (p.startsWith('/rest/v1/rpc/')) {
          const fn = p.split('/').pop(); const h = rpc[fn];
          if (!h) return send(res, 404, { code: 'PGRST202', message: `función ${fn} no emulada`, hint: null });
          const out = h(body, ctx); return out && out.__status ? send(res, out.__status, out.body) : send(res, 200, out === undefined ? null : out);
        }
        if (p.startsWith('/rest/v1/')) {
          const table = p.split('/').pop();
          // SYNTH_LEGACY_SCHEMA=1 imita un Supabase con el esquema HEREDADO (sin el baseline M24), como el QA real (M29):
          // tablas inexistentes → 404 PGRST205; selects con relaciones que no existen → 400 PGRST200. Solo para probar diagnósticos.
          if (process.env.SYNTH_LEGACY_SCHEMA && !p.includes('/rpc/')) {
            const sel = q.select || '';
            if (['shipping_methods', 'site_content', 'v_variant_availability', 'v_product_rating'].includes(table)) return send(res, 404, { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache`, details: null, hint: null });
            const rel = table === 'collections' && /collection_products/.test(sel) ? 'collection_products' : table === 'products' && /product_images/.test(sel) ? 'product_images' : null;
            if (rel) return send(res, 400, { code: 'PGRST200', message: `Could not find a relationship between '${table}' and '${rel}' in the schema cache`, details: `Searched for a foreign key relationship between '${table}' and '${rel}' in the schema 'public', but no matches were found.`, hint: null });
          }
          // Ejecución 72: SELECT por columnas en product_reviews (GRANT de la migración 20261111200000).
          if (table === 'product_reviews' && (req.method === 'GET' || req.method === 'HEAD')) {
            const cols = String(q.select || '*').replace(/\([^)]*\)/g, '').split(',').map((c) => c.trim().split(/\s|\(/)[0]).filter(Boolean);
            const hidden = Object.keys(q).filter((k) => !['select', 'order', 'limit', 'offset'].includes(k)).concat(cols);
            if (hidden.some((c) => ['*', 'user_id', 'order_item_id', 'moderated_by', 'moderated_at'].includes(c))) return send(res, 401, { code: '42501', message: 'permission denied for table product_reviews', details: null, hint: null });
          }
          if (req.method === 'GET' || req.method === 'HEAD') {
            let data = rows(table, q, ctx);
            if (table === 'online_orders' || table === 'inventories') data = [...data];
            const total = data.length; const offset = Number(q.offset || 0);
            if (offset) data = data.slice(offset);
            if (q.limit) data = data.slice(0, Number(q.limit));
            if (/vnd\.pgrst\.object/.test(req.headers.accept || '')) return data.length === 1 ? send(res, 200, data[0]) : send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${data.length} rows`, hint: null });
            // Como PostgREST: con Prefer count=exact el total va tras la barra de Content-Range.
            const exact = /count=exact/.test(req.headers.prefer || '');
            return send(res, 200, data, { 'Content-Range': `${data.length ? `${offset}-${offset + data.length - 1}` : '*'}/${exact ? total : '*'}` });
          }
          // Escrituras del cliente sobre su cuenta (ejecución 56), con las mismas reglas que la BD:
          // RLS por usuario (customer_addresses_own / profiles_update_own), columnas editables del perfil (GRANT UPDATE)
          // y una única dirección principal por usuario (uq_customer_addresses_default → 23505).
          const one = /vnd\.pgrst\.object/.test(req.headers.accept || '');
          const reply = (list) => (one ? (list.length === 1 ? send(res, 200, list[0]) : send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })) : send(res, 200, list));
          const dupDefault = (r, all) => r.is_default && all.some((o) => o !== r && o.id !== r.id && o.user_id === r.user_id && o.is_default);
          if (table === 'customer_addresses' && ['POST', 'PATCH', 'DELETE'].includes(req.method)) {
            if (!ctx.userId) return send(res, 401, { code: '42501', message: 'permission denied for table customer_addresses' });
            const all = S.tables.customer_addresses;
            if (req.method === 'POST') {
              const r = { id: crypto.randomUUID(), created_at: new Date().toISOString(), neighborhood: null, reference: null, is_default: false, ...body };
              if (r.user_id !== ctx.userId) return send(res, 403, { code: '42501', message: 'new row violates row-level security policy for table "customer_addresses"' });
              if (dupDefault(r, all)) return send(res, 409, { code: '23505', message: 'duplicate key value violates unique constraint "uq_customer_addresses_default"' });
              all.push(r); return reply([r]);
            }
            const hit = rows(table, q, { userId: ctx.userId });
            if (req.method === 'DELETE') { S.tables.customer_addresses = all.filter((r) => !hit.includes(r)); return reply(hit); }
            for (const r of hit) if (dupDefault({ ...r, ...body }, all)) return send(res, 409, { code: '23505', message: 'duplicate key value violates unique constraint "uq_customer_addresses_default"' });
            for (const r of hit) Object.assign(r, body, { user_id: r.user_id }); return reply(hit);
          }
          if (table === 'profiles' && req.method === 'PATCH') {
            const allowed = ['full_name', 'phone', 'avatar_url', 'preferred_size', 'preferred_fit', 'marketing_opt_in'];
            if (Object.keys(body).some((k) => !allowed.includes(k))) return send(res, 403, { code: '42501', message: 'permission denied for table profiles' });
            const hit = S.tables.profiles.filter((r) => r.id === ctx.userId && rows(table, q, ctx).includes(r));
            for (const r of hit) Object.assign(r, body); return reply(hit);
          }
          // Ejecución 69: baja/reactivación desde /admin/boletin. RLS newsletter_admin_update + GRANT UPDATE (unsubscribed_at).
          if (table === 'newsletter_subscribers' && req.method === 'PATCH') {
            if (Object.keys(body).some((k) => k !== 'unsubscribed_at')) return send(res, 403, { code: '42501', message: 'permission denied for table newsletter_subscribers' });
            const hit = rows(table, q, ctx); // vacío si no es admin, como la RLS
            for (const r of hit) Object.assign(r, body); return reply(hit);
          }
          if (table === 'product_reviews' && req.method === 'PATCH') { // moderación de /admin/reviews (RLS product_reviews_admin)
            if (Object.keys(body).some((k) => !['status', 'admin_reply', 'moderated_by', 'moderated_at'].includes(k))) return send(res, 400, { code: 'PGRST204', message: 'columna no emulada' });
            const hit = ctx.role === 'admin' ? rows(table, q, ctx) : [];
            for (const r of hit) Object.assign(r, body); return reply(hit);
          }
          return send(res, 405, { message: 'escritura directa no emulada' });
        }
        return send(res, 404, { message: 'no emulado' });
      } catch (e) { return send(res, 500, { message: String(e && e.stack || e) }); }
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, port, close: () => new Promise((r) => server.close(r)) })));
}

module.exports = { start };
if (require.main === module) start(Number(process.env.PORT) || 54321).then((s) => console.log(`backend sintético en http://127.0.0.1:${s.port}`));
