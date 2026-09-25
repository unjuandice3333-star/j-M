import { create } from 'zustand';

// Store focused on Outbox pattern for Offline Resilience and Synching
export const useSyncStore = create((set, get) => ({
  outboxQueue: [],
  isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  isSyncing: false,

  setOfflineStatus: (status) => set({ isOffline: status }),

  addToOutbox: (transaction) => {
    const { outboxQueue } = get();
    const updated = [...outboxQueue, { ...transaction, queued_at: new Date().toISOString() }];
    set({ outboxQueue: updated });
    localStorage.setItem('jm_pos_offline_outbox', JSON.stringify(updated));
  },

  loadOutbox: () => {
    const saved = localStorage.getItem('jm_pos_offline_outbox');
    if (saved) {
      set({ outboxQueue: JSON.parse(saved) });
    }
  },

  syncOutbox: async (supabaseClient) => {
    const { outboxQueue, isOffline, isSyncing } = get();
    if (isOffline || isSyncing || outboxQueue.length === 0) return;

    set({ isSyncing: true });
    console.log('Iniciando sincronización del buzón de salida offline...');

    try {
      const remainingQueue = [...outboxQueue];
      
      // Sincronizar uno a uno (Outbox Pattern)
      while (remainingQueue.length > 0) {
        const item = remainingQueue[0];
        
        // Simulación o envío real a la función atómica RPC 'create_sale_atomic' de Supabase
        if (supabaseClient) {
          const { error } = await supabaseClient.rpc('create_sale_atomic', {
            p_branch_id: item.branch_id,
            p_employee_id: item.employee_id,
            p_customer_id: item.customer_id,
            p_shift_id: item.shift_id,
            p_invoice_number: item.invoice_number,
            p_subtotal: item.subtotal,
            p_discount: item.discount,
            p_tax: item.tax,
            p_total: item.total,
            p_payment_method: item.payment_method,
            p_items: item.items
          });
          if (error) throw error;
        }

        // Si se procesó con éxito, remover del buzón local
        remainingQueue.shift();
        set({ outboxQueue: [...remainingQueue] });
        localStorage.setItem('jm_pos_offline_outbox', JSON.stringify(remainingQueue));
      }

      console.log('Sincronización finalizada exitosamente.');
    } catch (err) {
      console.error('Error durante la sincronización offline:', err);
    } finally {
      set({ isSyncing: false });
    }
  },
}));

// Setup global network event bindings
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useSyncStore.getState().setOfflineStatus(false);
    useSyncStore.getState().syncOutbox();
  });
  window.addEventListener('offline', () => {
    useSyncStore.getState().setOfflineStatus(true);
  });
}

export default useSyncStore;
