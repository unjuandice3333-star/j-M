import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { analyticsService } from '../services/analytics';
import { orderService, toOrderError } from '../services/orderService';

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
      isCartOpen: false,
      isSearchOpen: false,
      isMobileMenuOpen: false,
      searchQuery: '',
      activeCheckoutOrderId: null,
      appliedCoupon: null,   // { code, discountAmount, freeShipping } validado por la BD
      quote: null,           // última cotización de la BD (quote_cart) y la firma del carrito que la produjo
      cartNotice: null,      // avisos de reconciliación (productos retirados o sin stock)

      // Editorial (imágenes de portada)
      editorialImages: { ...DEFAULT_EDITORIAL_IMAGES },
      updateEditorialImage: (key, imageUrl) => set((state) => ({ editorialImages: { ...state.editorialImages, [key]: imageUrl } })),
      resetEditorialImage: (key) => {
        const defaultImg = DEFAULT_EDITORIAL_IMAGES[key];
        if (defaultImg) set((state) => ({ editorialImages: { ...state.editorialImages, [key]: defaultImg } }));
      },

      userProfile: { name: '', email: '', phone: '', preferredSize: 'M', preferredFit: 'REGULAR' },
      savedAddresses: [],
      orders: [],            // pedidos creados en este navegador: { id, order_number, public_token, total, status, created_at }

      activeModal: null,
      selectedModalCategory: 'camisetas',
      selectedModalProduct: null,

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
      changeVariant: (itemId, size, color) => {
        const { items, products } = get();
        const item = items.find((i) => i.id === itemId);
        const product = products.find((p) => p.id === item?.productId);
        const variant = product && findVariant(product, size, color);
        if (!variant) return { ok: false, message: 'Esa combinación de talla y color no existe.' };
        if (variant.available < item.quantity) return { ok: false, message: 'No hay stock suficiente en esa talla y color.' };
        const rest = items.filter((i) => i.id !== itemId);
        get().removeItem(itemId); set({ items: rest });
        return get().addItem(product, variant.size, variant.color, item.quantity);
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
          if (!wishlist.includes(item.productId)) set({ wishlist: [...wishlist, item.productId] });
          get().removeItem(itemId);
        }
      },

      clearCart: () => set({ items: [], appliedCoupon: null, quote: null, activeCheckoutOrderId: null }),

      /** Vacía el carrito solo si el pedido confirmado es el del checkout en curso. */
      finalizePaidOrder: (orderIdentifier) => {
        const { activeCheckoutOrderId, orders } = get();
        if (!orderIdentifier || !activeCheckoutOrderId) return false;
        const current = orders.find((o) => o.id === orderIdentifier || o.order_number === orderIdentifier);
        if (activeCheckoutOrderId === orderIdentifier || current?.id === activeCheckoutOrderId) {
          get().clearCart();
          return true;
        }
        return false;
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
        const q = await orderService.quote(items, { couponCode: appliedCoupon?.code ?? null, shippingMethod, email });
        if (cartSignature(get().items) !== signature) return null; // el carrito cambió mientras tanto
        if (appliedCoupon && q.coupon && !q.coupon.valid) set({ appliedCoupon: null });
        set({ quote: { ...q, signature, shippingMethod } });
        return q;
      },

      /** Totales para mostrar: los de la BD si la cotización corresponde al carrito; si no, una estimación local. */
      getTotals: () => {
        const { items, appliedCoupon, quote, shippingMethods } = get();
        const rawSubtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const standard = shippingMethods.find((m) => m.code === 'standard');
        const threshold = standard?.free_over_subtotal ?? null;
        if (quote && quote.signature === cartSignature(items)) {
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
        const shippingCost = free ? 0 : (standard?.cost ?? 0);
        return {
          rawSubtotal, couponDiscount, subtotal, shippingCost, total: subtotal + shippingCost, freeShippingThreshold: threshold,
          amountForFreeShipping: threshold ? Math.max(0, threshold - subtotal) : 0, hasFreeShipping: free && rawSubtotal > 0,
          canCheckout: items.length > 0, lines: [], isEstimate: true,
        };
      },

      // ---------------------------------------------------------------- lista de deseos
      toggleWishlist: (productId) => {
        const { wishlist } = get();
        set({ wishlist: wishlist.includes(productId) ? wishlist.filter((id) => id !== productId) : [...wishlist, productId] });
      },
      moveWishlistToCart: () => {
        const { wishlist, products, addItem } = get();
        const failed = [];
        for (const prodId of wishlist) {
          const prod = products.find((p) => p.id === prodId);
          const v = prod?.rawVariants.find((x) => x.available > 0);
          if (!v || !addItem(prod, v.size, v.color, 1).ok) failed.push(prod?.name ?? 'Producto no disponible');
        }
        return { ok: failed.length === 0, failed };
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
          created_at: new Date().toISOString(), isDuplicate: r.is_duplicate };
        set({ orders: [order, ...orders.filter((o) => o.id !== order.id)].slice(0, 20), activeCheckoutOrderId: order.id });
        return order;
      },

      /** Recuerda un pedido del cliente (id + token) para poder pagarlo o cancelarlo desde la confirmación. */
      rememberOrder: (o) => set({ orders: [{ id: o.id, order_number: o.order_number, public_token: o.public_token, total: Number(o.total),
        status: o.status, created_at: o.created_at }, ...get().orders.filter((x) => x.id !== o.id)].slice(0, 20) }),

      updateProfile: (updatedData) => set({ userProfile: { ...get().userProfile, ...updatedData } }),
      addAddress: (addressData) => set({ savedAddresses: [...get().savedAddresses, { id: `addr-${Date.now()}`, ...addressData }] }),

      setCartOpen: (open) => set({ isCartOpen: open }),
      setSearchOpen: (open) => set({ isSearchOpen: open }),
      setMobileMenuOpen: (open) => set({ isMobileMenuOpen: open }),
      setSearchQuery: (query) => set({ searchQuery: query }),

      openFitGuide: () => set({ activeModal: 'fitGuide' }),
      openSizeGuide: (category = 'camisetas') => set({ activeModal: 'sizeGuide', selectedModalCategory: category }),
      openSizeRecommender: (product = null) => set({ activeModal: 'sizeRecommender', selectedModalProduct: product }),
      closeModal: () => set({ activeModal: null }),
    }),
    {
      name: 'jm-fashion-store-cart-v14',
      version: 14,
      // v14 (M27): el carrito guarda variantes reales de la BD. Los carritos anteriores (catálogo simulado) se descartan.
      migrate: () => ({ items: [], wishlist: [], appliedCoupon: null, savedAddresses: [], orders: [], activeCheckoutOrderId: null }),
      partialize: (state) => ({
        items: state.items,
        wishlist: state.wishlist,
        appliedCoupon: state.appliedCoupon,
        savedAddresses: state.savedAddresses,
        editorialImages: state.editorialImages,
        orders: state.orders,
        activeCheckoutOrderId: state.activeCheckoutOrderId,
      }),
    }
  )
);
