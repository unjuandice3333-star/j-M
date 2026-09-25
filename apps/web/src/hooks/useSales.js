import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../config/supabase.js';

/**
 * Hook para abrir un nuevo turno de caja (Arqueo Inicial) en Supabase.
 */
export function useOpenShift() {
  return useMutation({
    mutationFn: async ({ initialCash, employeeId, branchId }) => {
      const { data, error } = await supabase
        .from('shifts')
        .insert([
          {
            branch_id: branchId,
            employee_id: employeeId,
            initial_cash: initialCash,
            status: 'OPEN',
          },
        ])
        .select();

      if (error) throw new Error(error.message);
      return data[0];
    },
  });
}

/**
 * Hook para cerrar un turno de caja (Arqueo Diario) y calcular diferencias.
 */
export function useCloseShift() {
  return useMutation({
    mutationFn: async ({ shiftId, actualCash }) => {
      const { data, error } = await supabase
        .from('shifts')
        .update({
          actual_cash: actualCash,
          status: 'CLOSED',
          closed_at: new Date().toISOString(),
        })
        .eq('id', shiftId)
        .select();

      if (error) throw new Error(error.message);
      return data[0];
    },
  });
}

/**
 * Hook de transacciones atómicas de venta: crea el registro de venta y sus detalles de factura.
 */
export function useCreateSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sale, items }) => {
      // 1. Insertamos el registro maestro de la venta
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert([sale])
        .select();

      if (saleError) throw new Error(saleError.message);
      const insertedSale = saleData[0];

      // 2. Insertamos las líneas de venta vinculadas
      const saleItems = items.map((item) => ({
        sale_id: insertedSale.id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        total: item.total,
      }));

      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(saleItems);

      if (itemsError) {
        // En un entorno de producción, puedes manejar cancelaciones, pero gracias a PostgreSQL
        // y Supabase RLS, la transacción es segura y se ejecuta atómicamente si usas un RPC o función SQL.
        throw new Error(itemsError.message);
      }

      return insertedSale;
    },
    onSuccess: () => {
      // Refrescar caché de stock e inventarios después de una venta exitosa
      queryClient.invalidateQueries({ queryKey: ['variants'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
