import { create } from 'zustand';
import { DEFAULT_TAX_RATE } from '@jm/shared';

// Cart store focused specifically on cart management, inline discounts, and totals
export const useCartStore = create((set, get) => ({
  cart: [],
  globalDiscount: 0, // Descuento global aplicado al total
  globalDiscountType: 'fixed', // 'fixed' o 'percentage'

  // Acciones
  addToCart: (variant, quantity = 1) => {
    const { cart } = get();
    const existingIndex = cart.findIndex((item) => item.variant_id === variant.id);

    if (existingIndex >= 0) {
      const updatedCart = [...cart];
      updatedCart[existingIndex].quantity += quantity;
      updatedCart[existingIndex].total =
        (updatedCart[existingIndex].quantity * updatedCart[existingIndex].unit_price) - updatedCart[existingIndex].discount;
      set({ cart: updatedCart });
    } else {
      const price = variant.price_override || variant.product?.base_price || 0;
      const newItem = {
        variant_id: variant.id,
        variant,
        quantity,
        unit_price: price,
        discount: 0, // Descuento individual por artículo
        total: price * quantity,
      };
      set({ cart: [...cart, newItem] });
    }
  },

  removeFromCart: (variantId) => {
    const { cart } = get();
    set({ cart: cart.filter((item) => item.variant_id !== variantId) });
  },

  updateCartQuantity: (variantId, quantity) => {
    if (quantity <= 0) {
      get().removeFromCart(variantId);
      return;
    }
    const { cart } = get();
    const updatedCart = cart.map((item) => {
      if (item.variant_id === variantId) {
        const itemSubtotal = quantity * item.unit_price;
        return {
          ...item,
          quantity,
          total: Math.max(0, itemSubtotal - item.discount),
        };
      }
      return item;
    });
    set({ cart: updatedCart });
  },

  applyItemDiscount: (variantId, discountAmount) => {
    const { cart } = get();
    const updatedCart = cart.map((item) => {
      if (item.variant_id === variantId) {
        const itemSubtotal = item.quantity * item.unit_price;
        const discount = Math.min(itemSubtotal, Math.max(0, discountAmount));
        return {
          ...item,
          discount,
          total: Math.max(0, itemSubtotal - discount),
        };
      }
      return item;
    });
    set({ cart: updatedCart });
  },

  setGlobalDiscount: (amount, type = 'fixed') => {
    set({ globalDiscount: Math.max(0, amount), globalDiscountType: type });
  },

  clearCart: () => set({ cart: [], globalDiscount: 0, globalDiscountType: 'fixed' }),

  // Totales calculados con el 19% IVA colombiano
  getCartTotals: () => {
    const { cart, globalDiscount, globalDiscountType } = get();
    const itemsSubtotal = cart.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const itemsDiscounts = cart.reduce((sum, item) => sum + item.discount, 0);
    const subtotalAfterItemDiscounts = Math.max(0, itemsSubtotal - itemsDiscounts);

    let calculatedGlobalDiscount = 0;
    if (globalDiscountType === 'percentage') {
      calculatedGlobalDiscount = subtotalAfterItemDiscounts * (globalDiscount / 100);
    } else {
      calculatedGlobalDiscount = globalDiscount;
    }

    const netSubtotal = Math.max(0, subtotalAfterItemDiscounts - calculatedGlobalDiscount);
    const tax = netSubtotal * DEFAULT_TAX_RATE;
    const total = netSubtotal + tax;

    return {
      subtotal: itemsSubtotal,
      itemDiscounts: itemsDiscounts,
      globalDiscount: calculatedGlobalDiscount,
      netSubtotal,
      tax,
      total,
    };
  },
}));

export default useCartStore;
