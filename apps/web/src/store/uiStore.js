import { create } from 'zustand';

// Store for global UI state, custom active modals, and Toast notifications
export const useUiStore = create((set, get) => ({
  toasts: [],
  isSidebarOpen: true,
  activePaymentModal: false,
  activeDiscountModal: false,

  // Toast System
  addToast: (message, type = 'success') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const newToast = { id, message, type };
    set({ toasts: [...get().toasts, newToast] });

    // Autoclose Toast after 4 seconds
    setTimeout(() => {
      get().removeToast(id);
    }, 4000);
  },

  removeToast: (id) => {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },

  // Modals & Panels
  setPaymentModal: (isOpen) => set({ activePaymentModal: isOpen }),
  setDiscountModal: (isOpen) => set({ activeDiscountModal: isOpen }),
  toggleSidebar: () => set({ isSidebarOpen: !get().isSidebarOpen }),
}));

export default useUiStore;
