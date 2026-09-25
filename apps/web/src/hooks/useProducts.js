import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../config/supabase.js';

/**
 * Hook para listar todos los productos base desde Supabase joining categorías y marcas.
 */
export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          category:categories(id, name),
          brand:brands(id, name)
        `)
        .is('deleted_at', null) // Soft Delete check
        .order('name', { ascending: true });

      if (error) throw new Error(error.message);
      return data;
    },
  });
}

/**
 * Hook para consultar todas las variantes de producto (Matriz Talla/Color) con stock.
 */
export function useVariants() {
  return useQuery({
    queryKey: ['variants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('variants')
        .select(`
          *,
          product:products(*),
          size:sizes(*),
          color:colors(*)
        `)
        .is('deleted_at', null)
        .order('sku', { ascending: true });

      if (error) throw new Error(error.message);
      return data;
    },
  });
}

/**
 * Hook para mutar/crear un nuevo producto base de forma atómica.
 */
export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newProduct) => {
      const { data, error } = await supabase
        .from('products')
        .insert([newProduct])
        .select();

      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
