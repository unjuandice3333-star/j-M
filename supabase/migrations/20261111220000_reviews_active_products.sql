-- =============================================================================
-- Reseñas: coherencia con productos retirados del catálogo (ejecución 74). Solo redefine funciones.
-- my_review_invitations (20261111200000) ya ocultaba los productos no activos, pero
-- my_product_reviewables los listaba y submit_product_review aceptaba reseñas de ellos (reseñas que
-- nadie vería: la tienda solo muestra fichas con status = 'active').
--  * my_product_reviewables: solo artículos de productos activos.
--  * submit_product_review: rechaza productos no activos con HINT JM_PRODUCT_INACTIVE.
-- Firmas, permisos (GRANT/REVOKE) y RLS sin cambios.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.my_product_reviewables(p_product_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para opinar' USING ERRCODE = 'P0001', HINT = 'JM_AUTH_REQUIRED';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'order_item_id', i.id,
             'order_number', o.order_number,
             'purchased_at', coalesce(o.paid_at, o.created_at),
             'size_code', i.size_code,
             'color_name', i.color_name,
             'review', CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
                 'id', r.id, 'status', r.status, 'rating', r.rating, 'title', r.title,
                 'comment', r.comment, 'admin_reply', r.admin_reply, 'created_at', r.created_at) END)
           ORDER BY coalesce(o.paid_at, o.created_at) DESC, i.id)
    FROM public.online_order_items i
    JOIN public.online_orders o ON o.id = i.order_id
    JOIN public.products p ON p.id = i.product_id AND p.status = 'active'
    LEFT JOIN public.product_reviews r ON r.order_item_id = i.id
    WHERE o.user_id = v_uid
      AND i.product_id = p_product_id
      AND o.status IN ('paid', 'processing', 'shipped', 'delivered')
  ), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.submit_product_review(p_order_item_id uuid, p_rating int, p_title text, p_comment text,
                                             p_city text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_product uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_comment text := btrim(coalesce(p_comment, ''));
  v_city text := nullif(btrim(coalesce(p_city, '')), '');
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para opinar' USING ERRCODE = 'P0001', HINT = 'JM_AUTH_REQUIRED';
  END IF;
  IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Elige una calificación de 1 a 5 estrellas' USING ERRCODE = 'P0001', HINT = 'JM_INVALID_INPUT';
  END IF;
  IF length(v_title) NOT BETWEEN 3 AND 120 THEN
    RAISE EXCEPTION 'El título debe tener entre 3 y 120 caracteres' USING ERRCODE = 'P0001', HINT = 'JM_INVALID_INPUT';
  END IF;
  IF length(v_comment) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'El comentario debe tener entre 10 y 2000 caracteres' USING ERRCODE = 'P0001', HINT = 'JM_INVALID_INPUT';
  END IF;
  IF v_city IS NOT NULL AND length(v_city) > 80 THEN
    RAISE EXCEPTION 'La ciudad debe tener como máximo 80 caracteres' USING ERRCODE = 'P0001', HINT = 'JM_INVALID_INPUT';
  END IF;

  -- Compra verificada: el artículo es de un pedido del propio usuario ya pagado.
  SELECT i.product_id INTO v_product
    FROM public.online_order_items i
    JOIN public.online_orders o ON o.id = i.order_id
   WHERE i.id = p_order_item_id AND o.user_id = v_uid
     AND o.status IN ('paid', 'processing', 'shipped', 'delivered')
   FOR SHARE OF i;
  IF v_product IS NULL THEN
    RAISE EXCEPTION 'Solo puedes opinar sobre productos que compraste' USING ERRCODE = 'P0001', HINT = 'JM_NOT_PURCHASED';
  END IF;

  -- Producto retirado del catálogo (archivado/borrador): la ficha no existe y la reseña no se vería.
  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = v_product AND p.status = 'active') THEN
    RAISE EXCEPTION 'Este producto ya no está disponible en la tienda' USING ERRCODE = 'P0001', HINT = 'JM_PRODUCT_INACTIVE';
  END IF;

  BEGIN
    INSERT INTO public.product_reviews (product_id, order_item_id, user_id, author_name, city, rating, title, comment, status)
    VALUES (v_product, p_order_item_id, v_uid, private.review_author_name(v_uid), v_city, p_rating, v_title, v_comment, 'pending')
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya opinaste sobre esta compra' USING ERRCODE = 'P0001', HINT = 'JM_ALREADY_REVIEWED';
  END;

  RETURN jsonb_build_object('id', v_id, 'status', 'pending', 'product_id', v_product);
END $$;

