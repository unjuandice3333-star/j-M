import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PRODUCTS } from '../data/mockData';
import { analyticsService } from '../services/analytics';
import supabase from '../config/supabase';

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

// Generador de ID de sesión para usuarios invitados
const getOrCreateSessionId = () => {
  try {
    let sid = localStorage.getItem('jm_cart_session_id');
    if (!sid) {
      sid = `guest-session-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
      localStorage.setItem('jm_cart_session_id', sid);
    }
    return sid;
  } catch (e) {
    return `guest-session-${Date.now()}`;
  }
};

export const useECommerceStore = create(
  persist(
    (set, get) => ({
      // Dynamic Products State (Synced from Supabase PostgreSQL)
      products: PRODUCTS,
      isLoadingProducts: false,
      productsError: null,
      productsLoaded: false,

      loadProducts: async (force = false) => {
        const { productsLoaded, isLoadingProducts } = get();
        if (productsLoaded && !force && !isLoadingProducts) return;

        set({ isLoadingProducts: true, productsError: null });
        try {
          const { default: productService } = await import('../services/productService');
          const fetchedProducts = await productService.getProducts();

          set({
            products: fetchedProducts,
            isLoadingProducts: false,
            productsLoaded: true,
            productsError: null
          });
        } catch (err) {
          console.error('[eCommerceStore Error]: Error al cargar productos desde Supabase:', err);
          set({
            isLoadingProducts: false,
            productsError: err.message || 'Error al conectar con la base de datos de productos.'
          });
        }
      },

      // Storefront Cart & Persistence State
      items: [],
      wishlist: ['prod-1', 'prod-3'],
      isCartOpen: false,
      isSearchOpen: false,
      isMobileMenuOpen: false,
      searchQuery: '',
      isSyncingCart: false,

      // Coupon State
      appliedCoupon: null,

      // Editorial Home Images Dynamic Store
      editorialImages: { ...DEFAULT_EDITORIAL_IMAGES },

      updateEditorialImage: (key, imageUrl) => {
        set((state) => ({
          editorialImages: {
            ...state.editorialImages,
            [key]: imageUrl
          }
        }));
      },

      resetEditorialImage: (key) => {
        const defaultImg = DEFAULT_EDITORIAL_IMAGES[key];
        if (defaultImg) {
          set((state) => ({
            editorialImages: {
              ...state.editorialImages,
              [key]: defaultImg
            }
          }));
        }
      },

      // Customer Profile & Address State
      userProfile: {
        name: '',
        email: '',
        phone: '',
        preferredSize: 'M',
        preferredFit: 'REGULAR'
      },

      savedAddresses: [],
      orders: [],

      // Modals
      activeModal: null,
      selectedModalCategory: 'camisetas',
      selectedModalProduct: null,

      // Sincronización del carrito en servidor Supabase (Carts & Cart_Items)
      syncCartWithServer: async () => {
        const { items } = get();
        set({ isSyncingCart: true });
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const userId = session?.user?.id || null;
          const sessionId = userId ? null : getOrCreateSessionId();

          // 1. Obtener o crear carrito activo en PostgreSQL
          let cartQuery = supabase.from('carts').select('id').eq('status', 'active');
          if (userId) {
            cartQuery = cartQuery.eq('user_id', userId);
          } else {
            cartQuery = cartQuery.eq('session_id', sessionId);
            if (sessionId) {
              cartQuery = cartQuery.setHeader('x-session-id', sessionId);
            }
          }

          let { data: cartRecord, error: cartErr } = await cartQuery.maybeSingle();

          if (!cartRecord) {
            let insertQuery = supabase
              .from('carts')
              .insert([{ user_id: userId, session_id: sessionId, status: 'active' }])
              .select('id');

            if (sessionId) {
              insertQuery = insertQuery.setHeader('x-session-id', sessionId);
            }

            const { data: newCart, error: newCartErr } = await insertQuery.single();

            if (!newCartErr && newCart) {
              cartRecord = newCart;
            }
          }

          if (cartRecord?.id && items.length > 0) {
            // Reconciliar cart_items en Supabase únicamente con variant_id UUID real
            const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            const BRANCH_ID = 'b1000000-0000-0000-0000-000000000001';

            const cartItemsPayload = items
              .filter((item) => item.variantId && UUID_REGEX.test(item.variantId) && item.variantId !== BRANCH_ID)
              .map((item) => ({
                cart_id: cartRecord.id,
                variant_id: item.variantId,
                quantity: item.quantity,
                unit_price: item.price
              }));

            if (cartItemsPayload.length > 0) {
              let itemsQuery = supabase
                .from('cart_items')
                .upsert(cartItemsPayload, { onConflict: 'cart_id,variant_id' });

              if (sessionId) {
                itemsQuery = itemsQuery.setHeader('x-session-id', sessionId);
              }

              await itemsQuery;
            }
          }
        } catch (e) {
          console.warn('[eCommerceStore Warning]: Cart server sync soft warning:', e);
        } finally {
          set({ isSyncingCart: false });
        }
      },

      // Cart Actions (Optimistic UX Update + Server Reconcile)
      addItem: (product, size, color, quantity = 1) => {
        const { items } = get();
        const colorName = typeof color === 'string' ? color : (color?.name || 'Único');

        // Resolver la variante real de PostgreSQL de forma autoritativa
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const BRANCH_ID = 'b1000000-0000-0000-0000-000000000001';

        let resolvedVariantId = null;
        if (product.variantId && UUID_REGEX.test(product.variantId) && product.variantId !== BRANCH_ID) {
          resolvedVariantId = product.variantId;
        }

        if (!resolvedVariantId && Array.isArray(product.rawVariants) && product.rawVariants.length > 0) {
          const normSize = String(size || '').trim().toUpperCase();
          const normColor = String(colorName || '').trim().toLowerCase();

          // 1. Coincidencia por talla y color
          let matched = product.rawVariants.find((v) => {
            const vSize = String(v.size || '').trim().toUpperCase();
            const vColor = String(v.color || '').trim().toLowerCase();
            return vSize === normSize && (vColor === normColor || vColor.includes(normColor) || normColor.includes(vColor));
          });

          // 2. Coincidencia defensiva por código de SKU si se requiere (ej: BEI para Beige Lino)
          if (!matched) {
            const colorCode = normColor.includes('beige') ? 'BEI' : normColor.includes('blanc') ? 'BLA' : normColor.includes('gris') ? 'GRI' : normColor.includes('negr') ? 'NEG' : '';
            matched = product.rawVariants.find((v) => {
              const vSize = String(v.size || '').trim().toUpperCase();
              return vSize === normSize && Boolean(colorCode && v.sku?.includes(colorCode));
            });
          }

          // 3. Fallback a coincidencia de talla
          if (!matched) {
            matched = product.rawVariants.find((v) => String(v.size || '').trim().toUpperCase() === normSize);
          }

          if (matched?.id && UUID_REGEX.test(matched.id) && matched.id !== BRANCH_ID) {
            resolvedVariantId = matched.id;
          }
        }

        const itemId = `${product.id}-${size}-${colorName}`;
        const existingIndex = items.findIndex((i) => i.id === itemId);

        let updatedItems = [];
        if (existingIndex >= 0) {
          updatedItems = [...items];
          updatedItems[existingIndex].quantity += quantity;
          if (resolvedVariantId) {
            updatedItems[existingIndex].variantId = resolvedVariantId;
          }
        } else {
          const newItem = {
            id: itemId,
            productId: product.id,
            variantId: resolvedVariantId,
            product,
            name: product.name,
            price: product.price,
            originalPrice: product.originalPrice,
            image: product.images ? product.images[0] : product.image,
            size,
            color: colorName,
            quantity
          };
          updatedItems = [...items, newItem];
        }

        set({ items: updatedItems, isCartOpen: true });
        analyticsService.addToCart(product, size, color, quantity);
        get().syncCartWithServer();
      },

      removeItem: (itemId) => {
        const itemToRemove = get().items.find((i) => i.id === itemId);
        if (itemToRemove) {
          analyticsService.removeFromCart(itemToRemove);
        }
        set({ items: get().items.filter((i) => i.id !== itemId) });
        get().syncCartWithServer();
      },

      updateQuantity: (itemId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(itemId);
          return;
        }
        set({
          items: get().items.map((i) => (i.id === itemId ? { ...i, quantity } : i))
        });
        get().syncCartWithServer();
      },

      saveForLater: (itemId) => {
        const { items, wishlist } = get();
        const item = items.find((i) => i.id === itemId);
        if (item) {
          if (!wishlist.includes(item.productId)) {
            set({ wishlist: [...wishlist, item.productId] });
          }
          get().removeItem(itemId);
        }
      },

      clearCart: () => {
        set({ items: [], appliedCoupon: null });
        get().syncCartWithServer();
      },

      // Coupon Actions
      applyCoupon: (code) => {
        const cleanCode = code.trim().toUpperCase();
        if (cleanCode === 'JM10OFF') {
          set({ appliedCoupon: { code: 'JM10OFF', percent: 10 } });
          return { success: true, message: '¡Cupón de 10% de descuento aplicado!' };
        } else if (cleanCode === 'BIENVENIDO2026') {
          set({ appliedCoupon: { code: 'BIENVENIDO2026', percent: 15 } });
          return { success: true, message: '¡Cupón de bienvenida 15% OFF aplicado!' };
        } else {
          return { success: false, message: 'Cupón no válido o expirado.' };
        }
      },

      removeCoupon: () => set({ appliedCoupon: null }),

      // Wishlist Actions
      toggleWishlist: (productId) => {
        const { wishlist } = get();
        if (wishlist.includes(productId)) {
          set({ wishlist: wishlist.filter((id) => id !== productId) });
        } else {
          set({ wishlist: [...wishlist, productId] });
        }
      },

      moveWishlistToCart: () => {
        const { wishlist, products, addItem } = get();
        wishlist.forEach((prodId) => {
          const prod = products.find((p) => p.id === prodId);
          if (prod) {
            addItem(prod, prod.sizes[0], prod.colors[0], 1);
          }
        });
      },

      isInWishlist: (productId) => get().wishlist.includes(productId),

      // Admin Product CRUD Actions
      addProduct: async (newProd) => {
        try {
          const { default: productService } = await import('../services/productService');
          const savedProduct = await productService.createProduct(newProd);

          if (savedProduct) {
            const { products } = get();
            set({ products: [savedProduct, ...products.filter((p) => p.id !== savedProduct.id)] });
            return savedProduct;
          }
        } catch (e) {
          console.error('[eCommerceStore Error]: Error al guardar producto en Supabase:', e);
          throw e;
        }
      },

      updateProduct: async (id, updatedFields) => {
        try {
          const { default: productService } = await import('../services/productService');
          const updatedProd = await productService.updateProduct(id, updatedFields);

          if (updatedProd) {
            const { products } = get();
            set({
              products: products.map((p) => (p.id === id ? { ...p, ...updatedProd } : p))
            });
            return updatedProd;
          }
        } catch (e) {
          console.error('[eCommerceStore Error]: Error al actualizar producto en Supabase:', e);
          throw e;
        }
      },

      deleteProduct: async (id) => {
        try {
          const { default: productService } = await import('../services/productService');
          await productService.deleteProduct(id);

          const { products } = get();
          set({ products: products.filter((p) => p.id !== id) });
          return true;
        } catch (e) {
          console.error('[eCommerceStore Error]: Error al eliminar producto en Supabase:', e);
          throw e;
        }
      },

      resetProductsToDefault: () => {
        get().loadProducts(true);
      },

      // Transactional & Idempotent Order Creation
      createOrder: async (orderData) => {
        const { orders, appliedCoupon, clearCart } = get();
        
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const idempotencyKey = orderData.idempotencyKey || `idemp-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

          // Invocar el RPC extendido e idempotente con validaciones server-side completas
          const { data: rpcResponse, error: rpcError } = await supabase.rpc('create_online_order_validated_idempotent', {
            p_customer_name: orderData.customerName || 'Cliente J&M',
            p_customer_email: orderData.email,
            p_customer_phone: orderData.phone,
            p_shipping_department: orderData.department || 'Cundinamarca',
            p_shipping_city: orderData.city || 'Bogotá D.C.',
            p_shipping_address: orderData.shippingAddress,
            p_shipping_neighborhood: orderData.neighborhood || '',
            p_shipping_notes: orderData.shippingNotes || '',
            p_shipping_method: orderData.shippingMethod || 'Envío Estándar Nacional',
            p_coupon_code: appliedCoupon?.code || null,
            p_items: (orderData.items || []).map((item) => {
              const cleanVariantId = item.variantId;
              const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
              const BRANCH_ID = 'b1000000-0000-0000-0000-000000000001';

              if (!cleanVariantId || !UUID_REGEX.test(cleanVariantId) || cleanVariantId === BRANCH_ID) {
                throw new Error(`La prenda "${item.name}" (Talla: ${item.size || 'M'}) no tiene una variante válida de catálogo. Por favor retírala del carrito y vuelve a seleccionarla.`);
              }
              return {
                variant_id: cleanVariantId,
                quantity: item.quantity,
                name: item.name,
                price: item.price,
                size: item.size,
                color: item.color
              };
            }),
            p_idempotency_key: idempotencyKey,
            p_user_id: session?.user?.id || null
          });

          if (rpcError) {
            console.error('[createOrder RPC Error]:', rpcError);
            throw new Error(rpcError.message || 'Error al procesar el pedido en el servidor.');
          }

          if (rpcResponse && rpcResponse.order_id) {
            const serverOrder = {
              id: rpcResponse.order_id,
              order_number: rpcResponse.order_number,
              date: 'Hoy',
              status: rpcResponse.status || 'payment_pending',
              total: rpcResponse.total,
              amount_in_cents: rpcResponse.amount_in_cents,
              isDuplicate: rpcResponse.is_duplicate || false,
              ...orderData
            };
            set({ orders: [serverOrder, ...orders] });
            clearCart();
            return {
              id: rpcResponse.order_id,
              order_id: rpcResponse.order_id,
              order_number: rpcResponse.order_number,
              orderNumber: rpcResponse.order_number,
              total: rpcResponse.total,
              amount_in_cents: rpcResponse.amount_in_cents
            };
          }
        } catch (e) {
          console.error('[eCommerceStore Error]: Error autoritativo en checkout server-side:', e);
          throw e;
        }
      },

      // Profile & Address Actions
      updateProfile: (updatedData) => {
        set({ userProfile: { ...get().userProfile, ...updatedData } });
      },

      addAddress: (addressData) => {
        const { savedAddresses } = get();
        const newAddress = {
          id: `addr-${Date.now()}`,
          ...addressData
        };
        set({ savedAddresses: [...savedAddresses, newAddress] });
      },

      // Drawer Controls
      setCartOpen: (open) => set({ isCartOpen: open }),
      setSearchOpen: (open) => set({ isSearchOpen: open }),
      setMobileMenuOpen: (open) => set({ isMobileMenuOpen: open }),
      setSearchQuery: (query) => set({ searchQuery: query }),

      // Modal Controls
      openFitGuide: () => set({ activeModal: 'fitGuide' }),
      openSizeGuide: (category = 'camisetas') =>
        set({ activeModal: 'sizeGuide', selectedModalCategory: category }),
      openSizeRecommender: (product = null) =>
        set({ activeModal: 'sizeRecommender', selectedModalProduct: product }),
      closeModal: () => set({ activeModal: null }),

      // Computed Totals
      getTotals: () => {
        const { items, appliedCoupon } = get();
        const rawSubtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

        let couponDiscount = 0;
        if (appliedCoupon && rawSubtotal > 0) {
          couponDiscount = Math.round(rawSubtotal * (appliedCoupon.percent / 100));
        }

        const subtotal = Math.max(0, rawSubtotal - couponDiscount);
        const freeShippingThreshold = 200000;
        const shippingCost = subtotal >= freeShippingThreshold || subtotal === 0 ? 0 : 15000;
        const amountForFreeShipping = Math.max(0, freeShippingThreshold - subtotal);

        return {
          rawSubtotal,
          couponDiscount,
          subtotal,
          shippingCost,
          total: subtotal + shippingCost,
          freeShippingThreshold,
          amountForFreeShipping,
          hasFreeShipping: subtotal >= freeShippingThreshold && subtotal > 0
        };
      }
    }),
    {
      name: 'jm-fashion-store-cart-v13',
      version: 13,
      migrate: (persistedState, version) => {
        if (!persistedState) return persistedState;

        // Descartar ítems corruptos de versiones previas con fallback b100... o sin variantId válido
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const BRANCH_ID = 'b1000000-0000-0000-0000-000000000001';

        const cleanItems = Array.isArray(persistedState.items)
          ? persistedState.items.filter((item) => item.variantId && UUID_REGEX.test(item.variantId) && item.variantId !== BRANCH_ID)
          : [];

        return {
          ...persistedState,
          items: cleanItems
        };
      },
      partialize: (state) => ({
        products: state.products,
        items: state.items,
        wishlist: state.wishlist,
        appliedCoupon: state.appliedCoupon,
        savedAddresses: state.savedAddresses,
        editorialImages: state.editorialImages
      })
    }
  )
);
