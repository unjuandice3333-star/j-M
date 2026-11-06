// M28 — Lista de deseos en public.wishlist_items (PK user_id+product_id ⇒ sin duplicados; RLS: solo el propietario).
import supabase from '../config/supabase';

const fail = (error, msg) => Object.assign(new Error(msg), { cause: error });

export const wishlistService = {
  /** ids de producto del usuario autenticado (RLS limita a sus filas), del más antiguo al más reciente. */
  async getIds() {
    const { data, error } = await supabase.from('wishlist_items').select('product_id').order('created_at', { ascending: true });
    if (error) throw fail(error, 'No se pudo cargar tu lista de deseos.');
    return data.map((r) => r.product_id);
  },

  /** Inserta sin duplicar (ON CONFLICT DO NOTHING). */
  async addMany(userId, productIds) {
    if (!productIds.length) return;
    const { error } = await supabase.from('wishlist_items')
      .upsert(productIds.map((product_id) => ({ user_id: userId, product_id })), { onConflict: 'user_id,product_id', ignoreDuplicates: true });
    if (error) throw fail(error, 'No se pudo guardar en tu lista de deseos.');
  },

  async remove(userId, productId) {
    const { error } = await supabase.from('wishlist_items').delete().eq('user_id', userId).eq('product_id', productId);
    if (error) throw fail(error, 'No se pudo quitar de tu lista de deseos.');
  },
};

export default wishlistService;
