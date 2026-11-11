-- =============================================================================
-- Reseñas escritas por el cliente (ejecución 71). Solo aditivo.
-- Antes la ficha solo leía product_reviews aprobadas y /admin/resenas moderaba, pero ningún cliente
-- podía escribir una (la RLS solo deja escribir a is_admin()).
--  * my_product_reviewables(product_id): artículos comprados por el usuario de ese producto, con la
--    reseña propia si ya existe (incluida la pendiente o rechazada, que la RLS no le deja leer).
--  * submit_product_review(order_item_id, rating, title, comment, city): crea la reseña en estado
--    'pending'. La compra se comprueba en la BD (pedido del usuario pagado, en preparación, enviado o
--    entregado), así que is_verified_buyer (columna generada: order_item_id IS NOT NULL) es veraz.
--    Una reseña por artículo comprado (UNIQUE order_item_id de la línea base).
--  * El nombre público se deriva del perfil (nombre + inicial del apellido); el cliente no lo elige.
-- No cambia la RLS de product_reviews: el cliente sigue sin INSERT/UPDATE directo.
-- =============================================================================

CREATE FUNCTION private.review_author_name(p_uid uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN coalesce(btrim(p.full_name), '') = '' THEN 'Cliente J&M'
    WHEN array_length(regexp_split_to_array(btrim(p.full_name), '\s+'), 1) = 1 THEN left(btrim(p.full_name), 60)
    ELSE left((regexp_split_to_array(btrim(p.full_name), '\s+'))[1], 60) || ' '
         || upper(left((regexp_split_to_array(btrim(p.full_name), '\s+'))[2], 1)) || '.'
  END
  FROM (SELECT 1) one LEFT JOIN public.profiles p ON p.id = p_uid
$$;
REVOKE ALL ON FUNCTION private.review_author_name(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.my_product_reviewables(p_product_id uuid) RETURNS jsonb
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
    LEFT JOIN public.product_reviews r ON r.order_item_id = i.id
    WHERE o.user_id = v_uid
      AND i.product_id = p_product_id
      AND o.status IN ('paid', 'processing', 'shipped', 'delivered')
  ), '[]'::jsonb);
END $$;

CREATE FUNCTION public.submit_product_review(p_order_item_id uuid, p_rating int, p_title text, p_comment text,
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

  BEGIN
    INSERT INTO public.product_reviews (product_id, order_item_id, user_id, author_name, city, rating, title, comment, status)
    VALUES (v_product, p_order_item_id, v_uid, private.review_author_name(v_uid), v_city, p_rating, v_title, v_comment, 'pending')
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya opinaste sobre esta compra' USING ERRCODE = 'P0001', HINT = 'JM_ALREADY_REVIEWED';
  END;

  RETURN jsonb_build_object('id', v_id, 'status', 'pending', 'product_id', v_product);
END $$;

REVOKE ALL ON FUNCTION public.my_product_reviewables(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_product_review(uuid, int, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_product_reviewables(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_product_review(uuid, int, text, text, text) TO authenticated;
