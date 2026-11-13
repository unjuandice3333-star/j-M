import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { analyticsService } from '../services/analytics';
import { orderService, toOrderError } from '../services/orderService';
import { wishlistService } from '../services/wishlistService';
import { resolveLookSelection } from '../utils/lookSelection';

export const DEFAULT_EDITORIAL_IMAGES = {
  hero_main: 'https://images.unsplash.com/photo-1490578474895-699cd4e2cf59?auto=format&fit=crop&q=80&w=2000',
  style_urbana: 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?auto=format&fit=crop&q=80&w=1000',
  style_elegante: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&q=80&w=1000',
  style_smart_casual: 'https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?auto=format&fit=crop&q=80&w=1000',
  category_camisetas: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=800',
  category_camisas: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&q=80&w=800',
  category_polos: 'https://images.unsplash.com/photo-1626557981101-aae6f84aa6ff?auto=format&fit=crop&q=80&w=800',
  category_jeans: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&q=80&w=800',
  category_pantalones: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&q=80&w=800',
  category_bermudas: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?auto=format&fit=crop&q=80&w=800',
  category_chaquetas: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&q=80&w=800',
  category_accesorios: 'https://images.unsplash.com/photo-1624222247344-550fb60583dc?auto=format&fit=crop&q=80&w=800',
  occasion_trabajo_oficina: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=800',
  occasion_cita_salidas: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&q=80&w=800',
  occasion_casual_urbano: 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?auto=format&fit=crop&q=80&w=800',
  occasion_noche_eventos: 'https://images.unsplash.com/photo-1534030347209-467a5b0ad3e6?auto=format&fit=crop&q=80&w=800',
  occasion_fin_semana: 'https://images.unsplash.com/photo-1488161628813-04466f872be2?auto=format&fit=crop&q=80&w=800',
  occasion_streetwear: 'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?auto=format&fit=crop&q=80&w=800',
  outfit_complete_look: 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?auto=format&fit=crop&q=80&w=1000'
};


const sameColor = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/** Variante exacta (talla + color) de un producto normalizado; null si la combinación no existe. */
export function findVariant(product, size, color) {
  const colorName = typeof color === 'string' ? color : color?.name;
  return (product?.rawVariants ?? []).find((v) => v.size === size && sameColor(v.color, colorName)) ?? null;
}

const cartSignature = (items) => items.map((i) => `${i.variantId}x${i.quantity}`).sort().join(',');
// Secuencia de solicitudes de cotización: solo se guarda la respuesta de la última (evita que una lenta pise a otra).
let quoteRequestSeq = 0;

export const useECommerceStore = create(
  persist(
    (set, get) => ({
      // ---------------------------------------------------------------- catálogo (BD, sin datos simulados)
      products: [],
      isLoadingProducts: false,
      productsError: null,
      productsLoaded: false,
      shippingMethods: [],

      loadProducts: async (force = false) => {
        const { productsLoaded, isLoadingProducts } = get();
        if ((productsLoaded && !force) || isLoadingProducts) return;
        set({ isLoadingProducts: true, productsError: null });
        try {
          const { default: productService } = await import('../services/productService');
          const [products, shippingMethods] = await Promise.all([productService.getProducts(), orderService.getShippingMethods()]);
          set({ products, shippingMethods, isLoadingProducts: false, productsLoaded: true });
          get().reconcileCart();
        } catch (err) {
          console.error('[catálogo] no se pudo cargar:', err?.cause?.message || err.message);
          set({ isLoadingProducts: false, productsError: 'No pudimos cargar el catálogo. Revisa tu conexión e inténtalo de nuevo.' });
        }
      },

      // ---------------------------------------------------------------- carrito (persistido en el navegador)
      items: [],
      wishlist: [],
      // M28: dueño de la lista en caché (id de usuario) o null si es la lista anónima de este navegador.
      // Con sesión, la fuente de verdad es public.wishlist_items; el navegador solo guarda una copia.
      wishlistOwner: null,
      wishlistError: null,
      isCartOpen: false,
      isSearchOpen: false,
      isMobileMenuOpen: false,
      searchQuery: '',
      activeCheckoutOrderId: null,
      // Ejecución 117: líneas compradas en el checkout en curso ({ variantId, quantity }). Al confirmarse el pago solo se
      // descuentan estas del carrito: lo que el cliente agregó después (p. ej. tras un pago rechazado) se conserva.
      activeCheckoutItems: null,
      appliedCoupon: null,   // { code, discountAmount, freeShipping } validado por la BD
      quote: null,           // última cotización de la BD (quote_cart) y la firma del carrito que la produjo
      cartNotice: null,      // avisos de reconciliación (productos retirados o sin stock)

      // Editorial (imágenes de portada) — M28: viene de public.site_content (BD), nunca del navegador.
      // editorialImages solo contiene las claves personalizadas por el admin; el resto usa la imagen del diseño.
      editorialImages: {},
      siteContent: {},
      siteContentError: null,
      loadSiteContent: async () => {
        try {
          const { default: siteContentService } = await import('../services/siteContentService');
          const siteContent = await siteContentService.getAll();
          const editorialImages = Object.fromEntries(Object.entries(siteContent).filter(([, v]) => v.url).map(([k, v]) => [k, v.url]));
          set({ siteContent, editorialImages, siteContentError: null });
        } catch (err) {
          console.error('[portada] no se pudo cargar site_content:', err?.cause?.message || err.message);
          set({ siteContentError: err.message });
        }
      },

      userProfile: { name: '', email: '', phone: '', preferredSize: 'M', preferredFit: 'REGULAR' },
      savedAddresses: [],
      orders: [],            // pedidos creados en este navegador: { id, order_number, public_token, total, status, created_at }

      activeModal: null,
      selectedModalCategory: 'camisetas',
      selectedModalProduct: null,
      recommendedSize: null, // { productId, size } elegido desde «Encuentra tu talla»

      /**
       * Agrega una variante concreta (talla + color) al carrito.
       * @returns {{ ok: boolean, message?: string }}
       */
      addItem: (product, size, color, quantity = 1) => {
        const colorName = typeof color === 'string' ? color : color?.name;
        const variant = findVariant(product, size, colorName);
        if (!variant) return { ok: false, message: 'Selecciona una talla y un color disponibles.' };
        const qty = Math.max(1, Math.floor(Number(quantity) || 1));
        const { items } = get();
        const existing = items.find((i) => i.variantId === variant.id);
        const wanted = (existing?.quantity ?? 0) + qty;
        if (variant.available <= 0) return { ok: false, message: 'Esta combinación está agotada.' };
        if (wanted > variant.available) return { ok: false, message: `Solo hay ${variant.available} unidad(es) disponibles de esta talla y color.` };

        const image = product.imagesByColor?.[variant.color]?.[0] ?? product.images?.[0] ?? null;
        const updatedItems = existing
          ? items.map((i) => (i.variantId === variant.id ? { ...i, quantity: wanted, available: variant.available } : i))
          : [...items, {
              id: variant.id, variantId: variant.id, productId: product.id, slug: product.slug, sku: variant.sku,
              name: product.name, price: variant.price, originalPrice: product.originalPrice, image,
              size: variant.size, color: variant.color, quantity: qty, available: variant.available,
            }];
        set({ items: updatedItems, isCartOpen: true });
        analyticsService.addToCart(product, size, colorName, qty);
        return { ok: true };
      },

      removeItem: (itemId) => {
        const item = get().items.find((i) => i.id === itemId);
        if (item) analyticsService.removeFromCart(item);
        set({ items: get().items.filter((i) => i.id !== itemId) });
      },

      /** Cambia la cantidad; 0 o menos elimina la línea; nunca supera el disponible conocido. */
      updateQuantity: (itemId, quantity) => {
        const q = Math.floor(Number(quantity) || 0);
        if (q <= 0) { get().removeItem(itemId); return { ok: true }; }
        const item = get().items.find((i) => i.id === itemId);
        if (!item) return { ok: false };
        if (item.available != null && q > item.available) return { ok: false, message: `Solo hay ${item.available} unidad(es) disponibles.` };
        set({ items: get().items.map((i) => (i.id === itemId ? { ...i, quantity: q } : i)) });
        return { ok: true };
      },

      /** Cambia la talla o el color de una línea del carrito por otra variante del mismo producto. */
      /**
       * M28: cambia la talla/color de una línea conservando su cantidad y su posición. Atómico: si la nueva variante no
       * existe o no tiene stock para la cantidad, el carrito no cambia (nada se elimina antes de validar). Si el carrito ya
       * tiene la variante destino, las líneas se fusionan sumando cantidades solo si el stock lo permite.
       * El precio sale de la variante (BD) y la cotización (quote_cart) se recalcula al cambiar la firma del carrito.
       */
      changeVariant: (itemId, size, color) => {
        const { items, products } = get();
        const item = items.find((i) => i.id === itemId);
        if (!item) return { ok: false, message: 'Ese artículo ya no está en el carrito.' };
        const product = products.find((p) => p.id === item.productId);
        if (!product) return { ok: false, message: 'Este producto ya no está disponible.' };
        const variant = findVariant(product, size, color);
        if (!variant) return { ok: false, message: 'Esa combinación de talla y color no existe.' };
        if (variant.id === item.variantId) return { ok: true };
        if (variant.available <= 0) return { ok: false, message: `${variant.size} / ${variant.color} está agotado.` };
        const twin = items.find((i) => i.variantId === variant.id);
        const total = item.quantity + (twin?.quantity ?? 0);
        if (total > variant.available) {
          return { ok: false, message: twin
            ? `Ya tienes ${twin.quantity} en ${variant.size} / ${variant.color}; solo hay ${variant.available} disponible(s).`
            : `Solo hay ${variant.available} unidad(es) en ${variant.size} / ${variant.color}.` };
        }
        const image = product.imagesByColor?.[variant.color]?.[0] ?? item.image;
        const next = twin
          ? items.filter((i) => i.id !== itemId).map((i) => (i.id === twin.id ? { ...i, quantity: total, price: variant.price, available: variant.available } : i))
          : items.map((i) => (i.id === itemId ? { ...i, id: variant.id, variantId: variant.id, sku: variant.sku, size: variant.size,
              color: variant.color, price: variant.price, available: variant.available, image } : i));
        set({ items: next, quote: null });
        return { ok: true, merged: Boolean(twin) };
      },

      /** Ajusta el carrito al catálogo actual: retira variantes inexistentes y actualiza precio y disponibilidad. */
      reconcileCart: () => {
        const { items, products } = get();
        const byVariant = new Map(products.flatMap((p) => p.rawVariants.map((v) => [v.id, { p, v }])));
        const notices = [];
        const next = [];
        for (const i of items) {
          const hit = byVariant.get(i.variantId);
          if (!hit) { notices.push(`${i.name} ya no está disponible y se retiró del carrito.`); continue; }
          if (hit.v.available <= 0) { notices.push(`${i.name} (${i.size}, ${i.color}) se agotó y se retiró del carrito.`); continue; }
          const quantity = Math.min(i.quantity, hit.v.available);
          if (quantity < i.quantity) notices.push(`${i.name}: solo quedan ${hit.v.available} unidad(es); se ajustó la cantidad.`);
          next.push({ ...i, price: hit.v.price, available: hit.v.available, quantity });
        }
        set({ items: next, cartNotice: notices.length ? notices.join(' ') : null });
      },
      dismissCartNotice: () => set({ cartNotice: null }),

      saveForLater: (itemId) => {
        const { items, wishlist } = get();
        const item = items.find((i) => i.id === itemId);
        if (item) {
          if (!wishlist.includes(item.productId)) get().toggleWishlist(item.productId);
          get().removeItem(itemId);
        }
      },

      clearCart: () => set({ items: [], appliedCoupon: null, quote: null, activeCheckoutOrderId: null, activeCheckoutItems: null }),

      /** Vacía el carrito solo si el pedido confirmado es el del checkout en curso. */
      finalizePaidOrder: (orderIdentifier) => {
        const { activeCheckoutOrderId, orders } = get();
        if (!orderIdentifier || !activeCheckoutOrderId) return false;
        const current = orders.find((o) => o.id === orderIdentifier || o.order_number === orderIdentifier);
        if (activeCheckoutOrderId === orderIdentifier || current?.id === activeCheckoutOrderId) {
          const bought = get().activeCheckoutItems;
          if (!Array.isArray(bought)) { get().clearCart(); return true; } // estado guardado antes de la ejecución 117
          const left = new Map(bought.map((b) => [b.variantId, Number(b.quantity) || 0]));
          const items = get().items
            .map((i) => {
              const paid = left.get(i.variantId) ?? 0;
              return paid > 0 ? { ...i, quantity: i.quantity - paid } : i;
            })
            .filter((i) => i.quantity > 0);
          // El cupón y la cotización eran de la compra ya pagada: no se arrastran a lo que queda en el carrito.
          set({ items, appliedCoupon: null, quote: null, activeCheckoutOrderId: null, activeCheckoutItems: null });
          return true;
        }
        return false;
      },

      /**
       * Ejecución 118: el pedido del checkout en curso ya no admite pago (cancelado o vencido). Deja de ser el «pedido
       * activo»: el carrito no se toca y el siguiente checkout crea un pedido nuevo.
       */
      releaseActiveCheckout: (orderId, status = null) => {
        const { activeCheckoutOrderId, orders } = get();
        if (!orderId || activeCheckoutOrderId !== orderId) return false;
        set({ activeCheckoutOrderId: null, activeCheckoutItems: null,
          orders: status ? orders.map((o) => (o.id === orderId ? { ...o, status } : o)) : orders });
        return true;
      },

      // ---------------------------------------------------------------- cupones y totales (BD)
      applyCoupon: async (code, email = null) => {
        const subtotal = get().items.reduce((n, i) => n + i.price * i.quantity, 0);
        try {
          const r = await orderService.validateCoupon(code, subtotal, email);
          if (!r.valid) return { success: false, message: r.message };
          set({ appliedCoupon: { code: r.code, discountAmount: Number(r.discount_amount), freeShipping: Boolean(r.free_shipping) }, quote: null });
          return { success: true, message: `Cupón ${r.code} aplicado.` };
        } catch (e) {
          return { success: false, message: toOrderError(e).message };
        }
      },
      removeCoupon: () => set({ appliedCoupon: null, quote: null }),

      /** Cotización autoritativa (precios, descuento, envío, stock) para el carrito actual. */
      refreshQuote: async ({ shippingMethod = 'standard', email = null } = {}) => {
        const { items, appliedCoupon } = get();
        if (items.length === 0) { set({ quote: null }); return null; }
        const signature = cartSignature(items);
        const requestId = ++quoteRequestSeq;
        const q = await orderService.quote(items, { couponCode: appliedCoupon?.code ?? null, shippingMethod, email });
        if (requestId !== quoteRequestSeq) return null; // llegó una cotización más reciente (p. ej. otro método de envío)
        if (cartSignature(get().items) !== signature) return null; // el carrito cambió mientras tanto
        if (appliedCoupon && q.coupon && !q.coupon.valid) set({ appliedCoupon: null });
        set({ quote: { ...q, signature, shippingMethod } });
        return q;
      },

      /** Totales para mostrar: los de la BD si la cotización corresponde al carrito; si no, una estimación local. */
      getTotals: (shippingMethod = 'standard') => {
        const { items, appliedCoupon, quote, shippingMethods } = get();
        const rawSubtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const method = shippingMethods.find((m) => m.code === shippingMethod);
        const threshold = method?.free_over_subtotal ?? null;
        // La cotización solo vale para el carrito Y el método de envío con que se pidió.
        if (quote && quote.signature === cartSignature(items) && (quote.shippingMethod ?? 'standard') === shippingMethod) {
          const subtotal = Number(quote.subtotal) - Number(quote.discount_total);
          return {
            rawSubtotal: Number(quote.subtotal), couponDiscount: Number(quote.discount_total), subtotal,
            shippingCost: Number(quote.shipping_cost), total: Number(quote.total), freeShippingThreshold: threshold,
            amountForFreeShipping: threshold ? Math.max(0, threshold - subtotal) : 0,
            hasFreeShipping: Number(quote.shipping_cost) === 0 && rawSubtotal > 0, canCheckout: Boolean(quote.can_checkout),
            lines: quote.lines ?? [], isEstimate: false,
          };
        }
        const couponDiscount = appliedCoupon ? Math.min(appliedCoupon.discountAmount, rawSubtotal) : 0;
        const subtotal = Math.max(0, rawSubtotal - couponDiscount);
        const free = rawSubtotal === 0 || appliedCoupon?.freeShipping || (threshold != null && subtotal >= threshold);
        const shippingCost = free ? 0 : (method?.cost ?? 0);
        return {
          rawSubtotal, couponDiscount, subtotal, shippingCost, total: subtotal + shippingCost, freeShippingThreshold: threshold,
          amountForFreeShipping: threshold ? Math.max(0, threshold - subtotal) : 0, hasFreeShipping: free && rawSubtotal > 0,
          canCheckout: items.length > 0, lines: [], isEstimate: true,
        };
      },

      // ---------------------------------------------------------------- lista de deseos
      /**
       * Sincroniza la lista con la sesión. userId null = sin sesión.
       * - Al iniciar sesión: la lista anónima de este navegador se fusiona en la BD (sin duplicados) y se carga la del usuario.
       * - Al cerrar sesión: se borra la copia local para no exponer la lista del usuario en un equipo compartido.
       */
      // Ejecución 116 (D88): sesión actual (no persistida). Los pedidos recordados guardan su dueño (`owner`):
      // al cerrar sesión se olvidan los de la cuenta (siguen en «Mis pedidos»), así otra persona que use este navegador
      // no ve su enlace (número + token → dirección y nombre). Los pedidos de invitado (owner null) se conservan: el
      // navegador es su único acceso además del enlace. `undefined` = aún no se conoce la sesión: si la primera lectura
      // es «sin sesión» (p. ej. la sesión venció con el navegador cerrado) también se olvidan los de la cuenta.
      sessionUserId: undefined,
      syncSession: (userId) => {
        const prev = get().sessionUserId;
        const next = userId ?? null;
        if (prev === next) return;
        // sessionUserId se usa al crear/recordar pedidos (owner); el resto del estado no depende de él.
        if (next === null) {
          const { orders, activeCheckoutOrderId } = get();
          const kept = orders.filter((o) => !o.owner);
          const activeKept = kept.some((o) => o.id === activeCheckoutOrderId) ? activeCheckoutOrderId : null;
          set({ sessionUserId: null, orders: kept, activeCheckoutOrderId: activeKept,
            activeCheckoutItems: activeKept ? get().activeCheckoutItems : null });
          return;
        }
        set({ sessionUserId: next });
      },

      syncWishlist: async (userId) => {
        const { wishlist, wishlistOwner } = get();
        if (!userId) {
          if (wishlistOwner) set({ wishlist: [], wishlistOwner: null, wishlistError: null });
          return;
        }
        try {
          if (wishlistOwner === null && wishlist.length) {
            // Uno a uno: un producto local que ya no existe (FK) no impide guardar el resto.
            await Promise.allSettled(wishlist.map((id) => wishlistService.addMany(userId, [id])));
          }
          const ids = await wishlistService.getIds();
          set({ wishlist: ids, wishlistOwner: userId, wishlistError: null });
        } catch (err) {
          set({ wishlistError: err.message });
        }
      },
      toggleWishlist: async (productId) => {
        const { wishlist, wishlistOwner } = get();
        const had = wishlist.includes(productId);
        set({ wishlist: had ? wishlist.filter((id) => id !== productId) : [...wishlist, productId], wishlistError: null });
        if (!wishlistOwner) return { ok: true };
        try {
          if (had) await wishlistService.remove(wishlistOwner, productId);
          else await wishlistService.addMany(wishlistOwner, [productId]);
          return { ok: true };
        } catch (err) {
          // Revertir: la UI no debe mostrar como guardado algo que la BD no tiene.
          set((st) => ({ wishlist: had ? [...st.wishlist.filter((id) => id !== productId), productId] : st.wishlist.filter((id) => id !== productId), wishlistError: err.message }));
          return { ok: false, message: err.message };
        }
      },
      /**
       * Agrega los favoritos al carrito con la talla y el color elegidos por prenda (`selections`: productId → {color,size}).
       * Antes se agregaba la primera variante con stock (p. ej. XS) sin preguntar. Si falta elegir alguna talla no se
       * agrega nada; las prendas agotadas se informan y no bloquean al resto.
       */
      moveWishlistToCart: (selections = {}) => {
        const { wishlist, products, addItem } = get();
        const inList = wishlist.map((id) => products.find((p) => p.id === id)).filter(Boolean);
        const unknown = wishlist.length - inList.length;
        const { ready, missing, soldOut } = resolveLookSelection(inList, selections);
        const names = (ps) => ps.map((p) => p.name);
        if (missing.length) return { ok: false, added: 0, missing: names(missing), soldOut: names(soldOut), failed: [] };
        const failed = [];
        for (const { product, size, color } of ready) {
          const r = addItem(product, size, color, 1);
          if (!r.ok) failed.push(`${product.name} (${r.message ?? 'no disponible'})`);
        }
        const added = ready.length - failed.length;
        for (let i = 0; i < unknown; i += 1) failed.push('Producto no disponible');
        return { ok: failed.length === 0 && soldOut.length === 0, added, missing: [], soldOut: names(soldOut), failed };
      },
      isInWishlist: (productId) => get().wishlist.includes(productId),

      // ---------------------------------------------------------------- administración de productos (RPC admin_*)
      addProduct: async (payload) => {
        const { adminService } = await import('../services/adminService');
        const saved = await adminService.upsertProduct(payload);
        await get().loadProducts(true);
        return saved;
      },
      updateProduct: async (_id, payload) => get().addProduct(payload),
      deleteProduct: async (id) => {
        const { adminService } = await import('../services/adminService');
        await adminService.setProductStatus(id, 'archived');
        await get().loadProducts(true);
        return true;
      },
      resetProductsToDefault: () => get().loadProducts(true),

      // ---------------------------------------------------------------- pedidos
      /**
       * Crea el pedido en la BD (create_order). La BD fija precios, descuento, envío y reserva el stock.
       * @param {{ customer: {name,email,phone,document?}, shipping: {department,city,address,neighborhood?,notes?},
       *           shippingMethod?: string, idempotencyKey: string }} input
       */
      createOrder: async ({ customer, shipping, shippingMethod = 'standard', idempotencyKey }) => {
        const { items, appliedCoupon, orders } = get();
        const r = await orderService.createOrder({ customer, shipping, items, couponCode: appliedCoupon?.code, shippingMethod, idempotencyKey });
        const order = { id: r.order_id, order_number: r.order_number, public_token: r.public_token, status: r.status,
          total: Number(r.total), amount_in_cents: Number(r.amount_in_cents), payment_expires_at: r.payment_expires_at,
          created_at: new Date().toISOString(), isDuplicate: r.is_duplicate, owner: get().sessionUserId ?? null };
        set({ orders: [order, ...orders.filter((o) => o.id !== order.id)].slice(0, 20), activeCheckoutOrderId: order.id,
          activeCheckoutItems: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })) });
        return order;
      },

      /** Recuerda un pedido del cliente (id + token) para poder pagarlo o cancelarlo desde la confirmación. */
      rememberOrder: (o) => set({ orders: [{ id: o.id, order_number: o.order_number, public_token: o.public_token, total: Number(o.total),
        status: o.status, created_at: o.created_at, owner: get().sessionUserId ?? null }, ...get().orders.filter((x) => x.id !== o.id)].slice(0, 20) }),

      updateProfile: (updatedData) => set({ userProfile: { ...get().userProfile, ...updatedData } }),
      addAddress: (addressData) => set({ savedAddresses: [...get().savedAddresses, { id: `addr-${Date.now()}`, ...addressData }] }),

      setCartOpen: (open) => set({ isCartOpen: open }),
      setSearchOpen: (open) => set({ isSearchOpen: open }),
      setMobileMenuOpen: (open) => set({ isMobileMenuOpen: open }),
      setSearchQuery: (query) => set({ searchQuery: query }),

      openFitGuide: () => set({ activeModal: 'fitGuide' }),
      openSizeGuide: (category = 'camisetas', sizeGroup = null) => set({ activeModal: 'sizeGuide', selectedModalCategory: category, selectedModalSizeGroup: sizeGroup }),
      openSizeRecommender: (product = null) => set({ activeModal: 'sizeRecommender', selectedModalProduct: product }),
      closeModal: () => set({ activeModal: null }),
      applyRecommendedSize: (productId, size) => set({ activeModal: null, recommendedSize: { productId, size } }),
      clearRecommendedSize: () => set({ recommendedSize: null }),
    }),
    {
      name: 'jm-fashion-store-cart-v14',
      version: 15,
      // v14 (M27): el carrito guarda variantes reales de la BD. Los carritos anteriores (catálogo simulado) se descartan.
      // v15 (M28): las imágenes de portada dejan de guardarse en el navegador (vienen de site_content).
      migrate: (persisted, version) => {
        if (version === 14 && persisted) { const { editorialImages: _drop, ...rest } = persisted; return rest; }
        return { items: [], wishlist: [], appliedCoupon: null, savedAddresses: [], orders: [], activeCheckoutOrderId: null, activeCheckoutItems: null };
      },
      partialize: (state) => ({
        items: state.items,
        wishlist: state.wishlist,
        wishlistOwner: state.wishlistOwner,
        appliedCoupon: state.appliedCoupon,
        savedAddresses: state.savedAddresses,
        orders: state.orders,
        activeCheckoutOrderId: state.activeCheckoutOrderId,
        activeCheckoutItems: state.activeCheckoutItems,
      }),
    }
  )
);
