import { create } from 'zustand';
import { DEFAULT_TAX_RATE } from '@jm/shared';

// Zustand store for POS operations and Offline Resilience
export const usePOSStore = create((set, get) => ({
  cart: [],
  discount: 0, // Descuento global aplicado al carrito
  activeShift: null, // Turno de caja actual
  offlineSalesQueue: [], // Ventas realizadas sin conexión a internet
  isOffline: !navigator.onLine,

  setOfflineStatus: (status) => set({ isOffline: status }),

  // 1. GESTIÓN DEL CARRITO DINÁMICO
  addToCart: (variant, quantity = 1) => {
    const { cart } = get();
    const existingIndex = cart.findIndex((item) => item.variant_id === variant.id);

    if (existingIndex >= 0) {
      const updatedCart = [...cart];
      updatedCart[existingIndex].quantity += quantity;
      updatedCart[existingIndex].total =
        updatedCart[existingIndex].quantity * updatedCart[existingIndex].unit_price;
      set({ cart: updatedCart });
    } else {
      const price = variant.price_override || variant.product?.base_price || 0;
      const newItem = {
        variant_id: variant.id,
        variant,
        quantity,
        unit_price: price,
        discount: 0,
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
        return {
          ...item,
          quantity,
          total: quantity * item.unit_price,
        };
      }
      return item;
    });
    set({ cart: updatedCart });
  },

  clearCart: () => set({ cart: [], discount: 0 }),

  applyDiscount: (amount) => set({ discount: Math.max(0, amount) }),

  // 2. TOTALES CALCULADOS
  getCartTotals: () => {
    const { cart, discount } = get();
    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
    const tax = (subtotal - discount) * DEFAULT_TAX_RATE;
    const total = Math.max(0, subtotal - discount + tax);

    return {
      subtotal,
      discount,
      tax,
      total,
    };
  },

  // 3. CONTROL DE CAJA (ARQUEO DIARIO)
  openShift: (initialCash, employeeId, branchId) => {
    const newShift = {
      id: `shift-${Date.now()}`,
      branch_id: branchId,
      employee_id: employeeId,
      opened_at: new Date().toISOString(),
      initial_cash: initialCash,
      status: 'OPEN',
    };
    set({ activeShift: newShift });
    localStorage.setItem('jm_pos_active_shift', JSON.stringify(newShift));
  },

  closeShift: (actualCash) => {
    const { activeShift } = get();
    if (!activeShift) return;

    const expectedCash = activeShift.initial_cash; // Simplificado para este paso
    const difference = actualCash - expectedCash;

    const closedShift = {
      ...activeShift,
      closed_at: new Date().toISOString(),
      actual_cash: actualCash,
      expected_cash: expectedCash,
      difference,
      status: 'CLOSED',
    };

    set({ activeShift: null });
    localStorage.removeItem('jm_pos_active_shift');
    return closedShift;
  },

  loadSavedShift: () => {
    const saved = localStorage.getItem('jm_pos_active_shift');
    if (saved) {
      set({ activeShift: JSON.parse(saved) });
    }
  },

  // 4. FLOW DE CHECKOUT (OFFLINE RESILIENT)
  checkout: async (paymentMethod, customerId = null) => {
    const { cart, activeShift, isOffline, clearCart, getCartTotals } = get();
    if (cart.length === 0 || !activeShift) {
      throw new Error('El carrito está vacío o no hay un turno de caja abierto.');
    }

    const totals = getCartTotals();
    const transactionId = `sale-${Date.now()}`;

    const newSale = {
      id: transactionId,
      branch_id: activeShift.branch_id,
      employee_id: activeShift.employee_id,
      customer_id: customerId,
      shift_id: activeShift.id,
      invoice_number: `F-${Date.now().toString().slice(-6)}`,
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      total: totals.total,
      payment_method: paymentMethod,
      items: cart.map((item) => ({
        variant_id: item.variant_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        total: item.total,
      })),
      status: 'COMPLETED',
      created_at: new Date().toISOString(),
    };

    if (isOffline) {
      // Guardar en cola local sin conexión
      const { offlineSalesQueue } = get();
      const updatedQueue = [...offlineSalesQueue, newSale];
      set({ offlineSalesQueue: updatedQueue });
      localStorage.setItem('jm_pos_offline_sales', JSON.stringify(updatedQueue));
      clearCart();
      return { success: true, offline: true, sale: newSale };
    } else {
      // ONLINE: Enviar directo a Supabase
      // (Aquí vendría el llamado Supabase.from('sales').insert(...))
      clearCart();
      return { success: true, offline: false, sale: newSale };
    }
  },

  syncOfflineSales: async () => {
    const { offlineSalesQueue, isOffline } = get();
    if (isOffline || offlineSalesQueue.length === 0) return;

    // Sincronizar asíncronamente cada venta guardada offline con Supabase
    try {
      console.log('Sincronizando ventas offline:', offlineSalesQueue);
      // Simular sincronización exitosa
      set({ offlineSalesQueue: [] });
      localStorage.removeItem('jm_pos_offline_sales');
      return { success: true, count: offlineSalesQueue.length };
    } catch (err) {
      console.error('Error al sincronizar ventas offline:', err);
    }
  },
}));

// Listeners globales para conexión a internet
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    usePOSStore.getState().setOfflineStatus(false);
    usePOSStore.getState().syncOfflineSales();
  });
  window.addEventListener('offline', () => {
    usePOSStore.getState().setOfflineStatus(true);
  });
}

export default usePOSStore;
