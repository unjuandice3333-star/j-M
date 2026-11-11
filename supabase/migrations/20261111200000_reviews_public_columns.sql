-- =============================================================================
-- Reseñas: lectura pública sin identificadores internos + invitaciones a opinar (ejecución 72). Solo aditivo
-- en esquema (no cambia tablas ni RLS); solo restringe privilegios de columna.
--  * Antes anon/authenticated podían SELECT cualquier columna de las reseñas aprobadas, incluidos user_id,
--    order_item_id, moderated_by y moderated_at (UUID de la cuenta del cliente, de su compra y del admin).
--    Ahora el SELECT es por columnas: solo lo que la tienda y /admin/reviews muestran. La RLS sigue igual
--    (público: aprobadas; admin: todas). UPDATE/DELETE del admin no cambian (no necesitan leer esas columnas).
--  * my_review_invitations(): artículos de pedidos ENTREGADOS del usuario sin reseña todavía, para avisarle
--    en «Mis pedidos» con enlace a la ficha (solo productos activos; uno por producto, el más reciente).
-- =============================================================================

REVOKE SELECT ON public.product_reviews FROM anon, authenticated;
GRANT SELECT (id, product_id, author_name, city, rating, title, comment, is_verified_buyer, status,
              admin_reply, created_at)
  ON public.product_reviews TO anon, authenticated;

CREATE FUNCTION public.my_review_invitations() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para opinar' USING ERRCODE = 'P0001', HINT = 'JM_AUTH_REQUIRED';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'order_item_id', x.item_id,
             'order_number', x.order_number,
             'delivered_at', x.delivered_at,
             'product_id', x.product_id,
             'product_name', x.product_name,
             'slug', x.slug,
             'image_url', x.image_url,
             'size_code', x.size_code,
             'color_name', x.color_name)
           ORDER BY x.delivered_at DESC, x.item_id)
    FROM (
      SELECT DISTINCT ON (i.product_id)
             i.id AS item_id, o.order_number, coalesce(o.delivered_at, o.updated_at) AS delivered_at,
             i.product_id, i.product_name, p.slug, i.image_url, i.size_code, i.color_name
        FROM public.online_order_items i
        JOIN public.online_orders o ON o.id = i.order_id
        JOIN public.products p ON p.id = i.product_id AND p.status = 'active'
       WHERE o.user_id = v_uid
         AND o.status = 'delivered'
         -- Sin reseña propia de ese producto (por cualquier compra): no insistir si ya opinó.
         AND NOT EXISTS (SELECT 1 FROM public.product_reviews r
                          WHERE r.product_id = i.product_id AND r.user_id = v_uid)
       ORDER BY i.product_id, coalesce(o.delivered_at, o.updated_at) DESC, i.id
    ) x
  ), '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.my_review_invitations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_review_invitations() TO authenticated;
