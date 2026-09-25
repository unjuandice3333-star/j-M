import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PRODUCTS } from '../data/mockData';

export const useECommerceStore = create(
  persist(
    (set, get) => ({
      // Dynamic Products State (Synced across Admin & Storefront)
      products: PRODUCTS,

      // Cart items for storefront
      items: [],
      wishlist: ['prod-1', 'prod-3'],
      isCartOpen: false,
      isSearchOpen: false,
      isMobileMenuOpen: false,
      searchQuery: '',

      // Coupon State
      appliedCoupon: null,

      // Customer Authentication & Google OAuth State
      isCustomerLoggedIn: false,
      customerUser: null,

      loginWithGoogle: () => {
        const googleCustomer = {
          id: `usr-google-${Date.now()}`,
          name: 'Alejandro Morales',
          email: 'alejo.morales@gmail.com',
          avatar: 'https://lh3.googleusercontent.com/a/default-user',
          provider: 'google'
        };
        set({
          isCustomerLoggedIn: true,
          customerUser: googleCustomer,
          userProfile: {
            ...get().userProfile,
            name: googleCustomer.name,
            email: googleCustomer.email
          }
        });
        return googleCustomer;
      },

      loginWithCustomerEmail: (email, name) => {
        const emailCustomer = {
          id: `usr-${Date.now()}`,
          name: name || email.split('@')[0],
          email,
          provider: 'email'
        };
        set({
          isCustomerLoggedIn: true,
          customerUser: emailCustomer,
          userProfile: {
            ...get().userProfile,
            name: emailCustomer.name,
            email
          }
        });
        return emailCustomer;
      },

      customerLogout: () => {
        set({ isCustomerLoggedIn: false, customerUser: null });
      },

      // Customer Profile & Address State
      userProfile: {
        name: 'Alejandro Morales',
        email: 'alejo.morales@gmail.com',
        phone: '+57 310 456 7890',
        preferredSize: 'M',
        preferredFit: 'REGULAR'
      },

      savedAddresses: [
        {
          id: 'addr-1',
          name: 'Casa Principal',
          department: 'Cundinamarca',
          city: 'Bogotá D.C.',
          address: 'Calle 93B # 11A - 28, Apt 402',
          neighborhood: 'El Chicó',
          notes: 'Dejar en portería con el celador de turno',
          isDefault: true
        }
      ],

      // Orders History State
      orders: [
        {
          id: 'JM-1024',
          date: '20 de Septiembre, 2026',
          status: 'Enviado',
          total: 319800,
          paymentMethod: 'Tarjeta de Crédito (Visa ***4242)',
          shippingAddress: 'Calle 93B # 11A - 28, Apt 402, Bogotá D.C.',
          trackingNumber: 'ENV-COL-8849201',
          items: [
            { name: 'Camiseta Heavyweight Oversize Essential', size: 'M', color: 'Negro Azabache', price: 129900, quantity: 1, image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=400' },
            { name: 'Camisa Oxford Premium Manga Larga', size: 'M', color: 'Azul Celeste', price: 189900, quantity: 1, image: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&q=80&w=400' }
          ]
        }
      ],

      // Modals
      activeModal: null,
      selectedModalCategory: 'camisetas',
      selectedModalProduct: null,

      // Admin Product Management Actions (Live Dynamic Storefront Sync)
      addProduct: (newProd) => {
        const { products } = get();
        const slug = newProd.slug || (newProd.name || 'producto-nuevo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        const product = {
          id: `prod-${Date.now()}`,
          name: newProd.name || 'Nueva Prenda J&M',
          slug: `${slug}-${Math.floor(Math.random() * 1000)}`,
          category: newProd.category || 'camisetas',
          price: Number(newProd.price) || 129900,
          originalPrice: newProd.originalPrice ? Number(newProd.originalPrice) : null,
          discountPercent: newProd.originalPrice && Number(newProd.originalPrice) > Number(newProd.price)
            ? Math.round(((Number(newProd.originalPrice) - Number(newProd.price)) / Number(newProd.originalPrice)) * 100)
            : 0,
          isNew: newProd.isNew !== undefined ? newProd.isNew : true,
          isBestSeller: newProd.isBestSeller || false,
          isSale: newProd.isSale || false,
          rating: 5.0,
          reviewCount: 1,
          fit: newProd.fit || 'REGULAR',
          occasion: newProd.occasion || 'casual',
          color: newProd.colors?.[0]?.name || 'Negro Azabache',
          colors: newProd.colors?.length > 0 ? newProd.colors : [
            { name: 'Negro Azabache', hex: '#121212', selected: true },
            { name: 'Blanco Nieve', hex: '#FFFFFF', selected: false }
          ],
          sizes: newProd.sizes?.length > 0 ? newProd.sizes : ['S', 'M', 'L', 'XL'],
          images: newProd.images?.length > 0 ? newProd.images : [
            'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=1000',
            'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&q=80&w=1000'
          ],
          description: newProd.description || 'Prenda de alta calidad confeccionada en Colombia por J&M Fashion Store.',
          details: newProd.details?.length > 0 ? newProd.details : ['100% Algodón Colombiano', 'Lavado suave', 'Hecho en Colombia'],
          fitDescription: newProd.fitDescription || 'Corte impecable con horma perfecta.',
          status: newProd.status || 'activo'
        };

        set({ products: [product, ...products] });
        return product;
      },

      updateProduct: (id, updatedFields) => {
        const { products } = get();
        set({
          products: products.map((p) => (p.id === id ? { ...p, ...updatedFields } : p))
        });
      },

      deleteProduct: (id) => {
        const { products } = get();
        set({ products: products.filter((p) => p.id !== id) });
      },

      resetProductsToDefault: () => {
        set({ products: PRODUCTS });
      },

      // Cart Actions
      addItem: (product, size, color, quantity = 1) => {
        const { items } = get();
        const colorName = typeof color === 'string' ? color : (color?.name || 'Único');
        const itemId = `${product.id}-${size}-${colorName}`;
        const existingIndex = items.findIndex((i) => i.id === itemId);

        if (existingIndex >= 0) {
          const updated = [...items];
          updated[existingIndex].quantity += quantity;
          set({ items: updated, isCartOpen: true });
        } else {
          const newItem = {
            id: itemId,
            productId: product.id,
            product,
            name: product.name,
            price: product.price,
            originalPrice: product.originalPrice,
            image: product.images ? product.images[0] : product.image,
            size,
            color: colorName,
            quantity
          };
          set({ items: [...items, newItem], isCartOpen: true });
        }
      },

      removeItem: (itemId) => {
        set({ items: get().items.filter((i) => i.id !== itemId) });
      },

      updateQuantity: (itemId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(itemId);
          return;
        }
        set({
          items: get().items.map((i) => (i.id === itemId ? { ...i, quantity } : i))
        });
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

      clearCart: () => set({ items: [], appliedCoupon: null }),

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

      // Order Actions
      createOrder: (orderData) => {
        const { orders, clearCart } = get();
        const newOrderId = `JM-${Math.floor(1000 + Math.random() * 9000)}`;
        const newOrder = {
          id: newOrderId,
          date: 'Hoy',
          status: 'Pedido recibido',
          ...orderData
        };
        set({ orders: [newOrder, ...orders] });
        clearCart();
        return newOrderId;
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
      name: 'jm-fashion-store-cart',
      partialize: (state) => ({
        products: state.products,
        items: state.items,
        wishlist: state.wishlist,
        appliedCoupon: state.appliedCoupon,
        userProfile: state.userProfile,
        savedAddresses: state.savedAddresses,
        orders: state.orders
      })
    }
  )
);
