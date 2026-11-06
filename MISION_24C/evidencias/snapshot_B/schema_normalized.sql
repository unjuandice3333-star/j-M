--
-- PostgreSQL database dump
--




--
-- Name: private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA private;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'customer',
    'admin',
    'super_admin'
);


--
-- Name: coupon_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.coupon_type AS ENUM (
    'percent',
    'fixed',
    'free_shipping'
);


--
-- Name: event_actor; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_actor AS ENUM (
    'system',
    'customer',
    'admin',
    'webhook'
);


--
-- Name: inventory_movement_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inventory_movement_type AS ENUM (
    'initial_load',
    'restock',
    'adjustment',
    'sale',
    'cancel_restore',
    'return',
    'damage'
);


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'payment_pending',
    'paid',
    'processing',
    'shipped',
    'delivered',
    'cancelled',
    'expired',
    'refunded'
);


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_method AS ENUM (
    'wompi'
);


--
-- Name: payment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_status AS ENUM (
    'PENDING',
    'APPROVED',
    'DECLINED',
    'VOIDED',
    'ERROR'
);


--
-- Name: product_fit; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_fit AS ENUM (
    'SLIM',
    'REGULAR',
    'RELAXED',
    'OVERSIZE'
);


--
-- Name: product_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_status AS ENUM (
    'draft',
    'active',
    'archived'
);


--
-- Name: redemption_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.redemption_status AS ENUM (
    'reserved',
    'confirmed',
    'released'
);


--
-- Name: refund_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.refund_status AS ENUM (
    'requested',
    'approved',
    'processed',
    'rejected'
);


--
-- Name: reservation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reservation_status AS ENUM (
    'active',
    'consumed',
    'released',
    'expired'
);


--
-- Name: review_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.review_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);


--
-- Name: size_group; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.size_group AS ENUM (
    'alpha',
    'numeric_pants',
    'footwear',
    'one_size'
);


--
-- Name: audit_row_change(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.audit_row_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_user_id, db_role, table_name, record_id, action, old_data, new_data)
  VALUES (
    auth.uid(), COALESCE(auth.role(), session_user), TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD) ->> 'id') ELSE (to_jsonb(NEW) ->> 'id') END,
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN NULL;
END $$;


--
-- Name: commit_stock_for_order(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.commit_stock_for_order(p_order_id uuid, p_actor uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  it record;
  inv record;
  res record;
  v_branch uuid;
  v_shortages jsonb := '[]'::jsonb;
BEGIN
  SELECT branch_id INTO v_branch FROM public.online_orders WHERE id = p_order_id;

  FOR it IN
    SELECT oi.variant_id, oi.quantity FROM public.online_order_items oi
     WHERE oi.order_id = p_order_id ORDER BY oi.variant_id
  LOOP
    SELECT * INTO inv FROM public.inventories
     WHERE variant_id = it.variant_id AND branch_id = v_branch FOR UPDATE;

    SELECT * INTO res FROM public.inventory_reservations
     WHERE order_id = p_order_id AND variant_id = it.variant_id AND status = 'active' FOR UPDATE;

    IF res.id IS NOT NULL THEN
      UPDATE public.inventories SET stock = stock - it.quantity, reserved = reserved - it.quantity WHERE id = inv.id;
      UPDATE public.inventory_reservations SET status = 'consumed' WHERE id = res.id;
    ELSIF inv.id IS NOT NULL AND inv.stock - inv.reserved >= it.quantity THEN
      UPDATE public.inventories SET stock = stock - it.quantity WHERE id = inv.id;
    ELSE
      v_shortages := v_shortages || jsonb_build_object('variant_id', it.variant_id, 'quantity', it.quantity,
                                                       'available', COALESCE(inv.stock - inv.reserved, 0));
      CONTINUE;
    END IF;

    INSERT INTO public.inventory_movements (inventory_id, variant_id, branch_id, movement_type, quantity_change,
                                            quantity_before, quantity_after, reason, reference_type, reference_id, actor_user_id)
    VALUES (inv.id, it.variant_id, v_branch, 'sale', -it.quantity, inv.stock, inv.stock - it.quantity,
            'Venta confirmada por pago', 'order', p_order_id, p_actor);
  END LOOP;
  RETURN v_shortages;
END $$;


--
-- Name: default_branch_id(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.default_branch_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT id FROM public.branches WHERE is_default AND is_active LIMIT 1
$$;


--
-- Name: evaluate_coupon(text, bigint, text, boolean); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.evaluate_coupon(p_code text, p_subtotal bigint, p_email text, p_lock boolean) RETURNS TABLE(coupon_id uuid, code text, is_valid boolean, reason text, discount_amount bigint, free_shipping boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_code text := upper(btrim(COALESCE(p_code, '')));
  c public.coupons%ROWTYPE;
  v_uses int;
  v_email_uses int;
  v_discount bigint := 0;
BEGIN
  IF v_code = '' THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, false, 'EMPTY'::text, 0::bigint, false;
    RETURN;
  END IF;

  IF p_lock THEN
    SELECT * INTO c FROM public.coupons cp WHERE cp.code = v_code FOR UPDATE;
  ELSE
    SELECT * INTO c FROM public.coupons cp WHERE cp.code = v_code;
  END IF;

  IF NOT FOUND OR NOT c.is_active THEN
    RETURN QUERY SELECT NULL::uuid, v_code, false, 'NOT_FOUND'::text, 0::bigint, false; RETURN;
  END IF;
  IF c.starts_at IS NOT NULL AND c.starts_at > now() THEN
    RETURN QUERY SELECT c.id, v_code, false, 'NOT_STARTED'::text, 0::bigint, false; RETURN;
  END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at <= now() THEN
    RETURN QUERY SELECT c.id, v_code, false, 'EXPIRED'::text, 0::bigint, false; RETURN;
  END IF;
  IF p_subtotal < c.min_subtotal THEN
    RETURN QUERY SELECT c.id, v_code, false, 'MIN_SUBTOTAL'::text, 0::bigint, false; RETURN;
  END IF;

  -- Usos = confirmados (used_count) + reservas vigentes de pedidos en pago
  SELECT c.used_count + count(*) INTO v_uses FROM public.coupon_redemptions r
   WHERE r.coupon_id = c.id AND r.status = 'reserved';
  IF c.max_uses IS NOT NULL AND v_uses >= c.max_uses THEN
    RETURN QUERY SELECT c.id, v_code, false, 'EXHAUSTED'::text, 0::bigint, false; RETURN;
  END IF;
  IF c.max_uses_per_email IS NOT NULL AND p_email IS NOT NULL THEN
    SELECT count(*) INTO v_email_uses FROM public.coupon_redemptions r
     WHERE r.coupon_id = c.id AND r.status IN ('reserved', 'confirmed')
       AND r.customer_email = lower(btrim(p_email));
    IF v_email_uses >= c.max_uses_per_email THEN
      RETURN QUERY SELECT c.id, v_code, false, 'EMAIL_LIMIT'::text, 0::bigint, false; RETURN;
    END IF;
  END IF;

  IF c.discount_type = 'percent' THEN
    v_discount := round(p_subtotal * c.discount_value / 100.0)::bigint;
  ELSIF c.discount_type = 'fixed' THEN
    v_discount := LEAST(c.discount_value, p_subtotal);
  END IF;

  RETURN QUERY SELECT c.id, v_code, true, 'OK'::text, v_discount, (c.discount_type = 'free_shipping');
END $$;


--
-- Name: forbid_mutation(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.forbid_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es de solo inserción (append-only)', TG_TABLE_NAME
    USING ERRCODE = 'P0001', HINT = 'JM_APPEND_ONLY';
END $$;


--
-- Name: guard_profile_role(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.guard_profile_role() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND current_setting('jm.allow_role_change', true) IS DISTINCT FROM 'on'
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'El rol solo puede cambiarse con admin_set_user_role()'
      USING ERRCODE = '42501', HINT = 'JM_FORBIDDEN';
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'El email del perfil se sincroniza desde Auth'
      USING ERRCODE = '42501', HINT = 'JM_FORBIDDEN';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  -- Todo registro público recibe el rol 'customer'. Los roles administrativos
  -- se asignan exclusivamente con public.admin_set_user_role() (super_admin).
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    lower(NEW.email),
    left(COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'), 150),
    NEW.raw_user_meta_data ->> 'avatar_url',
    'customer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;


--
-- Name: price_items(jsonb, boolean); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.price_items(p_items jsonb, p_lock boolean) RETURNS TABLE(variant_id uuid, product_id uuid, quantity integer, unit_price bigint, product_name text, sku text, size_code text, color_name text, image_url text, inventory_id uuid, available integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_branch uuid := private.default_branch_id();
  v_count int;
  v_bad text;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El pedido no contiene artículos' USING ERRCODE = 'P0001', HINT = 'JM_EMPTY_CART';
  END IF;
  IF jsonb_array_length(p_items) > 20 THEN
    RAISE EXCEPTION 'Máximo 20 líneas por pedido' USING ERRCODE = 'P0001', HINT = 'JM_TOO_MANY_ITEMS';
  END IF;

  -- Validación de forma de cada ítem
  SELECT string_agg(e::text, ', ') INTO v_bad
  FROM jsonb_array_elements(p_items) e
  WHERE jsonb_typeof(e) <> 'object'
     OR NOT (e ? 'variant_id') OR NOT (e ? 'quantity')
     OR (e ->> 'variant_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR (e ->> 'quantity') !~ '^[0-9]{1,3}$';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Artículo inválido: %', v_bad USING ERRCODE = 'P0001', HINT = 'JM_INVALID_ITEM';
  END IF;

  IF to_regclass('pg_temp._jm_items') IS NULL THEN
    CREATE TEMP TABLE _jm_items (variant_id uuid PRIMARY KEY, quantity int) ON COMMIT DROP;
  ELSE
    TRUNCATE _jm_items;
  END IF;
  INSERT INTO _jm_items (variant_id, quantity)
  SELECT (e ->> 'variant_id')::uuid, SUM((e ->> 'quantity')::int)
  FROM jsonb_array_elements(p_items) e
  GROUP BY 1;

  IF EXISTS (SELECT 1 FROM _jm_items WHERE _jm_items.quantity < 1 OR _jm_items.quantity > 20) THEN
    RAISE EXCEPTION 'La cantidad por prenda debe estar entre 1 y 20' USING ERRCODE = 'P0001', HINT = 'JM_INVALID_QUANTITY';
  END IF;

  -- Variantes inexistentes, inactivas o de productos no publicados
  SELECT count(*) INTO v_count
  FROM _jm_items it
  LEFT JOIN public.variants v ON v.id = it.variant_id AND v.is_active
  LEFT JOIN public.products p ON p.id = v.product_id AND p.status = 'active'
  WHERE p.id IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Una o más prendas ya no están disponibles en el catálogo' USING ERRCODE = 'P0001', HINT = 'JM_VARIANT_UNAVAILABLE';
  END IF;

  IF p_lock THEN
    PERFORM 1 FROM public.inventories inv
    WHERE inv.branch_id = v_branch AND inv.variant_id IN (SELECT it.variant_id FROM _jm_items it)
    ORDER BY inv.variant_id
    FOR UPDATE;
  END IF;

  RETURN QUERY
  SELECT it.variant_id,
         v.product_id,
         it.quantity,
         COALESCE(v.price_override, p.base_price),
         p.name,
         v.sku,
         s.code,
         c.name,
         (SELECT COALESCE(pi.external_url, pi.storage_path)
            FROM public.product_images pi
           WHERE pi.product_id = p.id AND (pi.color_id = v.color_id OR pi.color_id IS NULL)
           ORDER BY (pi.color_id IS NULL), pi.position
           LIMIT 1),
         inv.id,
         COALESCE(inv.stock - inv.reserved, 0)
  FROM _jm_items it
  JOIN public.variants v  ON v.id = it.variant_id
  JOIN public.products p  ON p.id = v.product_id
  JOIN public.sizes s     ON s.id = v.size_id
  JOIN public.colors c    ON c.id = v.color_id
  LEFT JOIN public.inventories inv ON inv.variant_id = v.id AND inv.branch_id = v_branch
  ORDER BY it.variant_id;
END $_$;


--
-- Name: release_reservations(uuid, public.reservation_status); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.release_reservations(p_order_id uuid, p_new_status public.reservation_status) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT res.id, res.inventory_id, res.quantity
      FROM public.inventory_reservations res
      JOIN public.inventories inv ON inv.id = res.inventory_id
     WHERE res.order_id = p_order_id AND res.status = 'active'
     ORDER BY inv.variant_id
     FOR UPDATE OF res, inv
  LOOP
    UPDATE public.inventories SET reserved = reserved - r.quantity WHERE id = r.inventory_id;
    UPDATE public.inventory_reservations SET status = p_new_status WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;


--
-- Name: require_admin(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.require_admin() RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso restringido a administradores' USING ERRCODE = '42501', HINT = 'JM_FORBIDDEN';
  END IF;
END $$;


--
-- Name: reservation_ttl(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.reservation_ttl() RETURNS interval
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$ SELECT interval '30 minutes' $$;


--
-- Name: restore_stock_for_order(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.restore_stock_for_order(p_order_id uuid, p_actor uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  m record;
  inv record;
  n int := 0;
BEGIN
  FOR m IN
    SELECT s.inventory_id, s.variant_id, s.branch_id, -s.quantity_change AS qty
      FROM public.inventory_movements s
     WHERE s.reference_type = 'order' AND s.reference_id = p_order_id AND s.movement_type = 'sale'
       AND NOT EXISTS (SELECT 1 FROM public.inventory_movements r
                        WHERE r.reference_type = 'order' AND r.reference_id = p_order_id
                          AND r.movement_type = 'cancel_restore' AND r.variant_id = s.variant_id)
     ORDER BY s.variant_id
  LOOP
    SELECT * INTO inv FROM public.inventories WHERE id = m.inventory_id FOR UPDATE;
    UPDATE public.inventories SET stock = stock + m.qty WHERE id = inv.id;
    INSERT INTO public.inventory_movements (inventory_id, variant_id, branch_id, movement_type, quantity_change,
                                            quantity_before, quantity_after, reason, reference_type, reference_id, actor_user_id)
    VALUES (inv.id, m.variant_id, m.branch_id, 'cancel_restore', m.qty, inv.stock, inv.stock + m.qty,
            'Reingreso por cancelación/reembolso', 'order', p_order_id, p_actor);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;


--
-- Name: shipping_cost(text, bigint, boolean); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.shipping_cost(p_method text, p_net_subtotal bigint, p_free_shipping boolean) RETURNS bigint
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  m public.shipping_methods%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.shipping_methods WHERE code = COALESCE(p_method, 'standard') AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Método de envío no disponible: %', p_method USING ERRCODE = 'P0001', HINT = 'JM_SHIPPING_UNAVAILABLE';
  END IF;
  IF p_free_shipping OR (m.free_over_subtotal IS NOT NULL AND p_net_subtotal >= m.free_over_subtotal) THEN
    RETURN 0;
  END IF;
  RETURN m.cost;
END $$;


--
-- Name: transition_order(uuid, public.order_status, public.event_actor, uuid, text, jsonb, jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.transition_order(p_order_id uuid, p_to public.order_status, p_actor public.event_actor, p_actor_user uuid, p_note text, p_tracking jsonb DEFAULT NULL::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  o public.online_orders%ROWTYPE;
  t public.order_status_transitions%ROWTYPE;
  v_shortages jsonb := '[]'::jsonb;
  v_restored int := 0;
  v_released int := 0;
  v_payment uuid;
  v_meta jsonb := COALESCE(p_metadata, '{}'::jsonb);
BEGIN
  SELECT * INTO o FROM public.online_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'P0001', HINT = 'JM_ORDER_NOT_FOUND';
  END IF;

  SELECT * INTO t FROM public.order_status_transitions
   WHERE from_status = o.status AND to_status = p_to AND allowed_actor = p_actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transición no permitida: % → % (%)', o.status, p_to, p_actor
      USING ERRCODE = 'P0001', HINT = 'JM_INVALID_TRANSITION';
  END IF;
  IF t.requires_note AND COALESCE(btrim(p_note), '') = '' THEN
    RAISE EXCEPTION 'Esta transición requiere una nota' USING ERRCODE = 'P0001', HINT = 'JM_NOTE_REQUIRED';
  END IF;

  -- Efectos por destino
  IF p_to = 'paid' THEN
    v_shortages := private.commit_stock_for_order(o.id, p_actor_user);
    UPDATE public.coupon_redemptions SET status = 'confirmed' WHERE order_id = o.id AND status IN ('reserved', 'released');
    IF FOUND THEN
      UPDATE public.coupons SET used_count = used_count + 1 WHERE id = o.coupon_id;
    END IF;
    UPDATE public.online_orders
       SET status = 'paid', paid_at = now(),
           needs_attention = needs_attention OR jsonb_array_length(v_shortages) > 0
     WHERE id = o.id;
    IF jsonb_array_length(v_shortages) > 0 THEN
      v_meta := v_meta || jsonb_build_object('shortages', v_shortages);
      INSERT INTO public.order_events (order_id, event_type, from_status, to_status, actor, actor_user_id, metadata)
      VALUES (o.id, 'PAID_WITHOUT_STOCK', o.status, 'paid', p_actor, p_actor_user, jsonb_build_object('shortages', v_shortages));
    END IF;

  ELSIF p_to IN ('expired', 'cancelled') AND o.status = 'payment_pending' THEN
    v_released := private.release_reservations(o.id, CASE WHEN p_to = 'expired' THEN 'expired' ELSE 'released' END::public.reservation_status);
    UPDATE public.coupon_redemptions SET status = 'released' WHERE order_id = o.id AND status = 'reserved';
    UPDATE public.online_orders
       SET status = p_to,
           cancelled_at = CASE WHEN p_to = 'cancelled' THEN now() END,
           cancel_reason = CASE WHEN p_to = 'cancelled' THEN p_note END
     WHERE id = o.id;

  ELSIF p_to IN ('cancelled', 'refunded') AND o.status IN ('paid', 'processing') THEN
    v_restored := private.restore_stock_for_order(o.id, p_actor_user);
    SELECT id INTO v_payment FROM public.payment_transactions
     WHERE order_id = o.id AND status = 'APPROVED' AND NOT requires_refund LIMIT 1;
    INSERT INTO public.order_refunds (order_id, payment_transaction_id, amount, reason, restock, requested_by)
    VALUES (o.id, v_payment, o.total, p_note, true, p_actor_user);
    UPDATE public.online_orders
       SET status = p_to,
           cancelled_at = CASE WHEN p_to = 'cancelled' THEN now() ELSE cancelled_at END,
           cancel_reason = CASE WHEN p_to = 'cancelled' THEN p_note ELSE cancel_reason END
     WHERE id = o.id;

  ELSIF p_to = 'refunded' AND o.status = 'delivered' THEN
    -- Mercancía en poder del cliente: el reingreso se registra al recibir la devolución
    -- (admin_adjust_inventory con tipo 'return').
    SELECT id INTO v_payment FROM public.payment_transactions
     WHERE order_id = o.id AND status = 'APPROVED' AND NOT requires_refund LIMIT 1;
    INSERT INTO public.order_refunds (order_id, payment_transaction_id, amount, reason, restock, requested_by)
    VALUES (o.id, v_payment, o.total, p_note, false, p_actor_user);
    UPDATE public.online_orders SET status = 'refunded' WHERE id = o.id;

  ELSIF p_to = 'shipped' THEN
    IF COALESCE(btrim(p_tracking ->> 'carrier'), o.carrier, '') = ''
       OR COALESCE(btrim(p_tracking ->> 'tracking_number'), o.tracking_number, '') = '' THEN
      RAISE EXCEPTION 'Para marcar como enviado se requieren transportadora y número de guía'
        USING ERRCODE = 'P0001', HINT = 'JM_TRACKING_REQUIRED';
    END IF;
    UPDATE public.online_orders
       SET status = 'shipped', shipped_at = now(),
           carrier = COALESCE(NULLIF(btrim(p_tracking ->> 'carrier'), ''), carrier),
           tracking_number = COALESCE(NULLIF(btrim(p_tracking ->> 'tracking_number'), ''), tracking_number),
           tracking_url = COALESCE(NULLIF(btrim(p_tracking ->> 'tracking_url'), ''), tracking_url)
     WHERE id = o.id;

  ELSIF p_to = 'delivered' THEN
    UPDATE public.online_orders SET status = 'delivered', delivered_at = now() WHERE id = o.id;

  ELSE
    UPDATE public.online_orders SET status = p_to WHERE id = o.id;
  END IF;

  INSERT INTO public.order_events (order_id, event_type, from_status, to_status, actor, actor_user_id, note, metadata)
  VALUES (o.id, 'STATUS_CHANGED', o.status, p_to, p_actor, p_actor_user, p_note,
          v_meta || jsonb_build_object('reservations_released', v_released, 'lines_restocked', v_restored));

  RETURN jsonb_build_object('order_id', o.id, 'order_number', o.order_number,
                            'from_status', o.status, 'to_status', p_to,
                            'shortages', v_shortages, 'lines_restocked', v_restored,
                            'reservations_released', v_released);
END $$;


--
-- Name: admin_adjust_inventory(uuid, integer, public.inventory_movement_type, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_adjust_inventory(p_variant_id uuid, p_quantity_change integer, p_movement_type public.inventory_movement_type, p_reason text, p_branch_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_branch uuid := COALESCE(p_branch_id, private.default_branch_id());
  inv public.inventories%ROWTYPE;
BEGIN
  PERFORM private.require_admin();
  IF p_movement_type NOT IN ('restock', 'adjustment', 'damage', 'return') THEN
    RAISE EXCEPTION 'Tipo de movimiento no permitido para ajustes manuales: %', p_movement_type
      USING ERRCODE = 'P0001', HINT = 'JM_INVALID_MOVEMENT';
  END IF;
  IF p_quantity_change IS NULL OR p_quantity_change = 0 THEN
    RAISE EXCEPTION 'La cantidad del ajuste no puede ser cero' USING ERRCODE = 'P0001', HINT = 'JM_INVALID_MOVEMENT';
  END IF;
  IF (p_movement_type IN ('restock', 'return') AND p_quantity_change < 0)
     OR (p_movement_type = 'damage' AND p_quantity_change > 0) THEN
    RAISE EXCEPTION 'El signo de la cantidad no corresponde al tipo de movimiento' USING ERRCODE = 'P0001', HINT = 'JM_INVALID_MOVEMENT';
  END IF;
  IF COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'El ajuste requiere un motivo' USING ERRCODE = 'P0001', HINT = 'JM_NOTE_REQUIRED';
  END IF;

  SELECT * INTO inv FROM public.inventories WHERE variant_id = p_variant_id AND branch_id = v_branch FOR UPDATE;
  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.variants WHERE id = p_variant_id) THEN
      RAISE EXCEPTION 'Variante no encontrada' USING ERRCODE = 'P0001', HINT = 'JM_VARIANT_NOT_FOUND';
    END IF;
    INSERT INTO public.inventories (branch_id, variant_id, stock) VALUES (v_branch, p_variant_id, 0) RETURNING * INTO inv;
  END IF;
  IF inv.stock + p_quantity_change < inv.reserved THEN
    RAISE EXCEPTION 'El ajuste dejaría el stock (%) por debajo de lo reservado (%)', inv.stock + p_quantity_change, inv.reserved
      USING ERRCODE = 'P0001', HINT = 'JM_BELOW_RESERVED';
  END IF;

  UPDATE public.inventories SET stock = stock + p_quantity_change WHERE id = inv.id;
  INSERT INTO public.inventory_movements (inventory_id, variant_id, branch_id, movement_type, quantity_change,
                                          quantity_before, quantity_after, reason, reference_type, actor_user_id)
  VALUES (inv.id, p_variant_id, v_branch, p_movement_type, p_quantity_change, inv.stock, inv.stock + p_quantity_change,
          btrim(p_reason), 'manual', auth.uid());

  RETURN jsonb_build_object('variant_id', p_variant_id, 'stock_before', inv.stock,
                            'stock_after', inv.stock + p_quantity_change, 'reserved', inv.reserved,
                            'available', inv.stock + p_quantity_change - inv.reserved);
END $$;


--
-- Name: admin_dashboard_metrics(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_dashboard_metrics(p_from timestamp with time zone DEFAULT date_trunc('month'::text, now()), p_to timestamp with time zone DEFAULT now()) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_sales bigint; v_orders int; v_units int;
BEGIN
  PERFORM private.require_admin();
  SELECT COALESCE(SUM(o.total), 0), count(*) INTO v_sales, v_orders
    FROM public.online_orders o
   WHERE o.paid_at >= p_from AND o.paid_at < p_to AND o.status IN ('paid', 'processing', 'shipped', 'delivered');
  SELECT COALESCE(SUM(oi.quantity), 0) INTO v_units
    FROM public.online_order_items oi JOIN public.online_orders o ON o.id = oi.order_id
   WHERE o.paid_at >= p_from AND o.paid_at < p_to AND o.status IN ('paid', 'processing', 'shipped', 'delivered');

  RETURN jsonb_build_object(
    'from', p_from, 'to', p_to,
    'gross_sales', v_sales,
    'paid_orders', v_orders,
    'average_ticket', CASE WHEN v_orders > 0 THEN round(v_sales::numeric / v_orders)::bigint ELSE 0 END,
    'units_sold', v_units,
    'refunds_requested', (SELECT COALESCE(SUM(amount), 0) FROM public.order_refunds
                           WHERE created_at >= p_from AND created_at < p_to),
    'orders_by_status', (SELECT jsonb_object_agg(sc.status::text, COALESCE(x.n, 0)) FROM public.order_status_catalog sc
                           LEFT JOIN (SELECT status, count(*) n FROM public.online_orders
                                       WHERE created_at >= p_from AND created_at < p_to GROUP BY status) x
                             ON x.status = sc.status),
    'needs_attention', (SELECT count(*) FROM public.online_orders WHERE needs_attention),
    'low_stock_variants', (SELECT count(*) FROM public.inventories i JOIN public.variants v ON v.id = i.variant_id
                            WHERE v.is_active AND i.stock - i.reserved <= i.min_stock),
    'top_products', (SELECT COALESCE(jsonb_agg(t ORDER BY t.units DESC, t.product_name), '[]'::jsonb) FROM (
                       SELECT oi.product_id, oi.product_name, SUM(oi.quantity)::int AS units, SUM(oi.line_total) AS revenue
                         FROM public.online_order_items oi JOIN public.online_orders o ON o.id = oi.order_id
                        WHERE o.paid_at >= p_from AND o.paid_at < p_to
                          AND o.status IN ('paid', 'processing', 'shipped', 'delivered')
                        GROUP BY oi.product_id, oi.product_name
                        ORDER BY units DESC, oi.product_name LIMIT 5) t));
END $$;


--
-- Name: admin_set_product_status(uuid, public.product_status); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_product_status(p_product_id uuid, p_status public.product_status) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE pr public.products%ROWTYPE;
BEGIN
  PERFORM private.require_admin();
  SELECT * INTO pr FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado' USING ERRCODE = 'P0001', HINT = 'JM_PRODUCT_NOT_FOUND';
  END IF;
  IF p_status = 'active' THEN
    IF NOT EXISTS (SELECT 1 FROM public.variants WHERE product_id = p_product_id AND is_active) THEN
      RAISE EXCEPTION 'No se puede publicar un producto sin variantes activas' USING ERRCODE = 'P0001', HINT = 'JM_PUBLISH_NO_VARIANTS';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.product_images WHERE product_id = p_product_id) THEN
      RAISE EXCEPTION 'No se puede publicar un producto sin imágenes' USING ERRCODE = 'P0001', HINT = 'JM_PUBLISH_NO_IMAGES';
    END IF;
  END IF;
  UPDATE public.products
     SET status = p_status,
         published_at = CASE WHEN p_status = 'active' THEN COALESCE(published_at, now()) ELSE published_at END
   WHERE id = p_product_id;
  RETURN jsonb_build_object('product_id', p_product_id, 'status', p_status);
END $$;


--
-- Name: admin_set_user_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role public.app_role) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_old public.app_role;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo un super_admin puede cambiar roles' USING ERRCODE = '42501', HINT = 'JM_FORBIDDEN';
  END IF;
  SELECT role INTO v_old FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado' USING ERRCODE = 'P0001', HINT = 'JM_USER_NOT_FOUND';
  END IF;
  IF v_old = 'super_admin' AND p_role <> 'super_admin'
     AND (SELECT count(*) FROM public.profiles WHERE role = 'super_admin') <= 1 THEN
    RAISE EXCEPTION 'No se puede retirar el último super_admin' USING ERRCODE = 'P0001', HINT = 'JM_LAST_SUPER_ADMIN';
  END IF;
  PERFORM set_config('jm.allow_role_change', 'on', true);
  UPDATE public.profiles SET role = p_role WHERE id = p_user_id;
  PERFORM set_config('jm.allow_role_change', 'off', true);
  RETURN jsonb_build_object('user_id', p_user_id, 'previous_role', v_old, 'role', p_role);
END $$;


--
-- Name: admin_transition_order(uuid, public.order_status, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_transition_order(p_order_id uuid, p_to public.order_status, p_note text DEFAULT NULL::text, p_tracking jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM private.require_admin();
  RETURN private.transition_order(p_order_id, p_to, 'admin', auth.uid(), p_note, p_tracking);
END $$;


--
-- Name: admin_upsert_product(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_upsert_product(p jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_id uuid := NULLIF(p ->> 'id', '')::uuid;
  v_is_new boolean;
  v_category public.categories%ROWTYPE;
  v_style uuid;
  v_branch uuid := private.default_branch_id();
  c jsonb;
  img jsonb;
  v jsonb;
  v_color uuid;
  v_size uuid;
  v_size_group public.size_group;
  v_variant uuid;
  v_sku text;
  v_inv uuid;
  v_stock int;
  v_listed_colors uuid[] := '{}';
  v_listed_variants uuid[] := '{}';
  v_pos int;
BEGIN
  PERFORM private.require_admin();

  SELECT * INTO v_category FROM public.categories WHERE slug = p ->> 'category';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoría desconocida: %', p ->> 'category' USING ERRCODE = 'P0001', HINT = 'JM_UNKNOWN_CATEGORY';
  END IF;
  IF p ? 'style_line' AND NULLIF(p ->> 'style_line', '') IS NOT NULL THEN
    SELECT id INTO v_style FROM public.style_lines WHERE slug = p ->> 'style_line';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Línea de estilo desconocida: %', p ->> 'style_line' USING ERRCODE = 'P0001', HINT = 'JM_UNKNOWN_STYLE_LINE';
    END IF;
  END IF;
  IF jsonb_typeof(p -> 'colors') IS DISTINCT FROM 'array' OR jsonb_array_length(p -> 'colors') = 0 THEN
    RAISE EXCEPTION 'El producto debe declarar al menos un color' USING ERRCODE = 'P0001', HINT = 'JM_COLORS_REQUIRED';
  END IF;

  v_is_new := v_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_id);

  IF v_is_new THEN
    INSERT INTO public.products (id, reference, slug, name, description, details, fit, fit_description,
                                 category_id, style_line_id, base_price, compare_at_price, base_cost,
                                 is_featured_new, is_bestseller, brand_id)
    VALUES (COALESCE(v_id, gen_random_uuid()), upper(p ->> 'reference'), lower(p ->> 'slug'), p ->> 'name',
            p ->> 'description',
            COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(p -> 'details', '[]'::jsonb))), '{}'),
            COALESCE(p ->> 'fit', 'REGULAR')::public.product_fit, p ->> 'fit_description',
            v_category.id, v_style, (p ->> 'base_price')::bigint, NULLIF(p ->> 'compare_at_price', '')::bigint,
            NULLIF(p ->> 'base_cost', '')::bigint,
            COALESCE((p ->> 'is_featured_new')::boolean, false), COALESCE((p ->> 'is_bestseller')::boolean, false),
            (SELECT id FROM public.brands ORDER BY created_at LIMIT 1))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.products SET
      reference = upper(p ->> 'reference'), slug = lower(p ->> 'slug'), name = p ->> 'name',
      description = p ->> 'description',
      details = COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(p -> 'details', '[]'::jsonb))), '{}'),
      fit = COALESCE(p ->> 'fit', 'REGULAR')::public.product_fit, fit_description = p ->> 'fit_description',
      category_id = v_category.id, style_line_id = v_style,
      base_price = (p ->> 'base_price')::bigint, compare_at_price = NULLIF(p ->> 'compare_at_price', '')::bigint,
      base_cost = NULLIF(p ->> 'base_cost', '')::bigint,
      is_featured_new = COALESCE((p ->> 'is_featured_new')::boolean, false),
      is_bestseller = COALESCE((p ->> 'is_bestseller')::boolean, false)
    WHERE id = v_id;
  END IF;

  -- Ocasiones (reemplazo)
  DELETE FROM public.product_occasions WHERE product_id = v_id;
  INSERT INTO public.product_occasions (product_id, occasion_id)
  SELECT v_id, oc.id FROM public.occasions oc
   WHERE oc.slug IN (SELECT jsonb_array_elements_text(COALESCE(p -> 'occasions', '[]'::jsonb)));
  IF (SELECT count(*) FROM public.product_occasions WHERE product_id = v_id)
     <> jsonb_array_length(COALESCE(p -> 'occasions', '[]'::jsonb)) THEN
    RAISE EXCEPTION 'Ocasión desconocida en %', p -> 'occasions' USING ERRCODE = 'P0001', HINT = 'JM_UNKNOWN_OCCASION';
  END IF;

  -- Colores
  v_pos := 0;
  FOR c IN SELECT * FROM jsonb_array_elements(p -> 'colors') LOOP
    SELECT id INTO v_color FROM public.colors WHERE slug = c ->> 'color';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Color desconocido: %', c ->> 'color' USING ERRCODE = 'P0001', HINT = 'JM_UNKNOWN_COLOR';
    END IF;
    v_listed_colors := v_listed_colors || v_color;
    INSERT INTO public.product_colors (product_id, color_id, position, is_default)
    VALUES (v_id, v_color, v_pos, false)
    ON CONFLICT (product_id, color_id) DO UPDATE SET position = EXCLUDED.position, is_default = false;
    v_pos := v_pos + 1;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.variants WHERE product_id = v_id AND NOT (color_id = ANY (v_listed_colors))) THEN
    RAISE EXCEPTION 'No se puede quitar un color que tiene variantes; desactive las variantes en su lugar'
      USING ERRCODE = 'P0001', HINT = 'JM_COLOR_IN_USE';
  END IF;
  DELETE FROM public.product_colors WHERE product_id = v_id AND NOT (color_id = ANY (v_listed_colors));

  UPDATE public.product_colors pc SET is_default = true
   WHERE pc.product_id = v_id
     AND pc.color_id = COALESCE(
       (SELECT co.id FROM jsonb_array_elements(p -> 'colors') e JOIN public.colors co ON co.slug = e ->> 'color'
         WHERE (e ->> 'is_default')::boolean IS TRUE LIMIT 1),
       v_listed_colors[1]);

  -- Imágenes (reemplazo completo)
  DELETE FROM public.product_images WHERE product_id = v_id;
  FOR c IN SELECT * FROM jsonb_array_elements(p -> 'colors') LOOP
    SELECT id INTO v_color FROM public.colors WHERE slug = c ->> 'color';
    v_pos := 0;
    FOR img IN SELECT * FROM jsonb_array_elements(COALESCE(c -> 'images', '[]'::jsonb)) LOOP
      INSERT INTO public.product_images (product_id, color_id, storage_path, external_url, alt_text, position)
      VALUES (v_id, v_color, img ->> 'storage_path', img ->> 'external_url', img ->> 'alt_text', v_pos);
      v_pos := v_pos + 1;
    END LOOP;
  END LOOP;
  v_pos := 0;
  FOR img IN SELECT * FROM jsonb_array_elements(COALESCE(p -> 'general_images', '[]'::jsonb)) LOOP
    INSERT INTO public.product_images (product_id, color_id, storage_path, external_url, alt_text, position)
    VALUES (v_id, NULL, img ->> 'storage_path', img ->> 'external_url', img ->> 'alt_text', v_pos);
    v_pos := v_pos + 1;
  END LOOP;

  -- Variantes
  FOR v IN SELECT * FROM jsonb_array_elements(COALESCE(p -> 'variants', '[]'::jsonb)) LOOP
    SELECT id INTO v_color FROM public.colors WHERE slug = v ->> 'color';
    IF v_color IS NULL OR NOT (v_color = ANY (v_listed_colors)) THEN
      RAISE EXCEPTION 'La variante usa un color no declarado en el producto: %', v ->> 'color'
        USING ERRCODE = 'P0001', HINT = 'JM_COLOR_NOT_DECLARED';
    END IF;
    v_size_group := COALESCE(NULLIF(v ->> 'size_group', '')::public.size_group, v_category.size_group);
    SELECT id INTO v_size FROM public.sizes WHERE size_group = v_size_group AND code = upper(v ->> 'size');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Talla % no existe en el sistema %', v ->> 'size', v_size_group
        USING ERRCODE = 'P0001', HINT = 'JM_UNKNOWN_SIZE';
    END IF;
    v_sku := upper(COALESCE(NULLIF(v ->> 'sku', ''),
                            upper(p ->> 'reference') || '-' || (v ->> 'color') || '-' || (v ->> 'size')));

    INSERT INTO public.variants (id, product_id, color_id, size_id, sku, barcode, price_override, is_active)
    VALUES (COALESCE(NULLIF(v ->> 'id', '')::uuid, gen_random_uuid()), v_id, v_color, v_size, v_sku,
            NULLIF(v ->> 'barcode', ''), NULLIF(v ->> 'price_override', '')::bigint, true)
    ON CONFLICT (product_id, color_id, size_id) DO UPDATE
      SET sku = EXCLUDED.sku, barcode = EXCLUDED.barcode, price_override = EXCLUDED.price_override, is_active = true
    RETURNING id INTO v_variant;
    v_listed_variants := v_listed_variants || v_variant;

    SELECT id INTO v_inv FROM public.inventories WHERE variant_id = v_variant AND branch_id = v_branch;
    IF NOT FOUND THEN
      v_stock := GREATEST(COALESCE((v ->> 'initial_stock')::int, 0), 0);
      INSERT INTO public.inventories (branch_id, variant_id, stock) VALUES (v_branch, v_variant, v_stock)
      RETURNING id INTO v_inv;
      IF v_stock > 0 THEN
        INSERT INTO public.inventory_movements (inventory_id, variant_id, branch_id, movement_type, quantity_change,
                                                quantity_before, quantity_after, reason, reference_type, reference_id, actor_user_id)
        VALUES (v_inv, v_variant, v_branch, 'initial_load', v_stock, 0, v_stock, 'Carga inicial al crear la variante',
                'product_setup', v_id, auth.uid());
      END IF;
    END IF;
  END LOOP;

  UPDATE public.variants SET is_active = false
   WHERE product_id = v_id AND NOT (id = ANY (v_listed_variants)) AND is_active;

  RETURN jsonb_build_object(
    'product_id', v_id, 'created', v_is_new,
    'variants', (SELECT jsonb_agg(jsonb_build_object('id', vv.id, 'sku', vv.sku, 'color', co.slug, 'size', s.code,
                                                     'is_active', vv.is_active) ORDER BY vv.sku)
                 FROM public.variants vv JOIN public.colors co ON co.id = vv.color_id JOIN public.sizes s ON s.id = vv.size_id
                 WHERE vv.product_id = v_id));
END $$;


--
-- Name: apply_payment_event(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_payment_event(p_event jsonb, p_event_checksum text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_tx jsonb := p_event -> 'data' -> 'transaction';
  v_event_type text := p_event ->> 'event';
  v_ref text := v_tx ->> 'reference';
  v_ptid text := v_tx ->> 'id';
  v_status text := v_tx ->> 'status';
  v_amount bigint;
  v_currency text := COALESCE(v_tx ->> 'currency', 'COP');
  v_webhook_id uuid;
  a public.payment_transactions%ROWTYPE;
  o public.online_orders%ROWTYPE;
  v_result text := 'applied';
  v_detail text;
  v_order_after public.order_status;
BEGIN
  IF COALESCE(btrim(p_event_checksum), '') = '' THEN
    RAISE EXCEPTION 'Checksum requerido' USING ERRCODE = 'P0001', HINT = 'JM_INVALID_EVENT';
  END IF;

  INSERT INTO public.webhook_events (event_checksum, event_type, provider_transaction_id, reference, payload)
  VALUES (lower(btrim(p_event_checksum)), v_event_type, v_ptid, v_ref, p_event)
  ON CONFLICT (provider, event_checksum) DO NOTHING
  RETURNING id INTO v_webhook_id;

  IF v_webhook_id IS NULL THEN
    RETURN jsonb_build_object('result', 'duplicate', 'reference', v_ref);
  END IF;

  -- Validación del contenido
  IF v_event_type IS DISTINCT FROM 'transaction.updated' THEN
    v_result := 'ignored'; v_detail := 'unsupported_event';
  ELSIF v_tx IS NULL OR v_ref IS NULL OR v_ptid IS NULL
        OR v_status NOT IN ('PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR')
        OR (v_tx ->> 'amount_in_cents') !~ '^[0-9]+$' THEN
    v_result := 'rejected'; v_detail := 'malformed_transaction';
  ELSE
    v_amount := (v_tx ->> 'amount_in_cents')::bigint;
    SELECT * INTO a FROM public.payment_transactions WHERE reference = v_ref FOR UPDATE;
    IF NOT FOUND THEN
      v_result := 'rejected'; v_detail := 'unknown_reference';
    ELSIF a.provider_transaction_id IS NOT NULL AND a.provider_transaction_id <> v_ptid THEN
      v_result := 'rejected'; v_detail := 'transaction_id_mismatch';
    ELSIF EXISTS (SELECT 1 FROM public.payment_transactions x WHERE x.provider_transaction_id = v_ptid AND x.id <> a.id) THEN
      v_result := 'rejected'; v_detail := 'transaction_id_reused';
    ELSIF v_amount <> a.amount_in_cents OR v_currency <> a.currency THEN
      v_result := 'rejected'; v_detail := 'amount_or_currency_mismatch';
    END IF;
  END IF;

  IF v_result = 'applied' THEN
    SELECT * INTO o FROM public.online_orders WHERE id = a.order_id FOR UPDATE;

    IF a.status = v_status::public.payment_status THEN
      v_result := 'ignored'; v_detail := 'status_unchanged';
    ELSIF a.status IN ('DECLINED', 'ERROR') OR (a.status = 'VOIDED') THEN
      v_result := 'ignored'; v_detail := 'attempt_already_final';
    ELSIF a.status = 'APPROVED' AND v_status <> 'VOIDED' THEN
      v_result := 'ignored'; v_detail := 'attempt_already_approved';
    ELSE
      UPDATE public.payment_transactions
         SET status = v_status::public.payment_status,
             provider_transaction_id = v_ptid,
             payment_method_type = COALESCE(v_tx ->> 'payment_method_type', payment_method_type),
             status_message = v_tx ->> 'status_message',
             last_event_at = now(),
             raw_last_event = p_event,
             requires_refund = CASE
               WHEN v_status = 'APPROVED' AND (
                    o.status NOT IN ('payment_pending', 'expired')
                    OR EXISTS (SELECT 1 FROM public.payment_transactions x
                                WHERE x.order_id = a.order_id AND x.id <> a.id
                                  AND x.status = 'APPROVED' AND NOT x.requires_refund))
               THEN true ELSE false END
       WHERE id = a.id
      RETURNING * INTO a;

      IF v_status = 'APPROVED' THEN
        IF a.requires_refund THEN
          UPDATE public.online_orders SET needs_attention = true WHERE id = o.id;
          INSERT INTO public.order_events (order_id, event_type, actor, metadata)
          VALUES (o.id, 'PAYMENT_REQUIRES_REFUND', 'webhook',
                  jsonb_build_object('reference', v_ref, 'provider_transaction_id', v_ptid, 'order_status', o.status));
          v_detail := 'approved_requires_refund';
        ELSE
          PERFORM private.transition_order(o.id, 'paid', 'webhook', NULL, NULL, NULL,
                                           jsonb_build_object('reference', v_ref, 'provider_transaction_id', v_ptid));
          v_detail := 'order_paid';
        END IF;
      ELSIF v_status = 'VOIDED' AND o.status <> 'payment_pending' AND NOT a.requires_refund
            AND EXISTS (SELECT 1 FROM public.online_orders WHERE id = o.id AND status IN ('paid', 'processing', 'shipped', 'delivered')) THEN
        UPDATE public.online_orders SET needs_attention = true WHERE id = o.id;
        INSERT INTO public.order_events (order_id, event_type, actor, metadata)
        VALUES (o.id, 'PAYMENT_VOIDED_AFTER_PAID', 'webhook', jsonb_build_object('reference', v_ref));
        v_detail := 'voided_after_paid_needs_review';
      ELSIF v_status IN ('DECLINED', 'ERROR', 'VOIDED') THEN
        INSERT INTO public.order_events (order_id, event_type, actor, metadata)
        VALUES (o.id, 'PAYMENT_ATTEMPT_FAILED', 'webhook',
                jsonb_build_object('reference', v_ref, 'status', v_status, 'message', v_tx ->> 'status_message'));
        v_detail := 'attempt_failed_order_unchanged';
      ELSE
        v_detail := 'attempt_pending';
      END IF;
    END IF;
  END IF;

  UPDATE public.webhook_events SET processed_at = now(), result = v_result, detail = v_detail WHERE id = v_webhook_id;
  SELECT status INTO v_order_after FROM public.online_orders WHERE id = a.order_id;
  RETURN jsonb_build_object('result', v_result, 'detail', v_detail, 'reference', v_ref,
                            'order_status', v_order_after, 'attempt_status', a.status);
END $_$;


--
-- Name: cancel_my_order(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_my_order(p_order_id uuid, p_public_token uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE o public.online_orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.online_orders WHERE id = p_order_id;
  IF NOT FOUND OR NOT ((auth.uid() IS NOT NULL AND o.user_id = auth.uid())
                       OR (p_public_token IS NOT NULL AND o.public_token = p_public_token)) THEN
    RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'P0001', HINT = 'JM_ORDER_NOT_FOUND';
  END IF;
  RETURN private.transition_order(o.id, 'cancelled', 'customer', auth.uid(),
                                  COALESCE(NULLIF(btrim(p_reason), ''), 'Cancelado por el cliente'));
END $$;


--
-- Name: create_order(jsonb, jsonb, jsonb, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_order(p_customer jsonb, p_shipping jsonb, p_items jsonb, p_coupon_code text DEFAULT NULL::text, p_shipping_method text DEFAULT 'standard'::text, p_idempotency_key text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_name text := btrim(COALESCE(p_customer ->> 'name', ''));
  v_email text := lower(btrim(COALESCE(p_customer ->> 'email', '')));
  v_phone text := regexp_replace(COALESCE(p_customer ->> 'phone', ''), '[^0-9]', '', 'g');
  v_doc text := NULLIF(btrim(COALESCE(p_customer ->> 'document', '')), '');
  v_dept text := btrim(COALESCE(p_shipping ->> 'department', ''));
  v_city text := btrim(COALESCE(p_shipping ->> 'city', ''));
  v_addr text := btrim(COALESCE(p_shipping ->> 'address', ''));
  v_branch uuid := private.default_branch_id();
  v_existing public.online_orders%ROWTYPE;
  v_subtotal bigint;
  v_discount bigint := 0;
  v_free boolean := false;
  v_shipping bigint;
  v_order public.online_orders%ROWTYPE;
  v_expires timestamptz := now() + private.reservation_ttl();
  cpn record;
  v_coupon_ok boolean := false;
  v_coupon_id uuid;
  v_coupon_code text;
  ln record;
  v_alloc bigint := 0;
  v_line_disc bigint;
  v_line_count int;
  v_i int := 0;
BEGIN
  -- Validaciones de entrada
  IF length(v_key) < 8 OR length(v_key) > 150 THEN
    RAISE EXCEPTION 'Clave de idempotencia inválida' USING ERRCODE = 'P0001', HINT = 'JM_IDEMPOTENCY_KEY';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('jm-order:' || v_key, 0));

  SELECT * INTO v_existing FROM public.online_orders WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object('order_id', v_existing.id, 'order_number', v_existing.order_number,
      'public_token', v_existing.public_token, 'status', v_existing.status,
      'subtotal', v_existing.subtotal, 'discount_total', v_existing.discount_total,
      'shipping_cost', v_existing.shipping_cost, 'total', v_existing.total,
      'amount_in_cents', v_existing.total * 100, 'currency', 'COP',
      'payment_expires_at', v_existing.payment_expires_at, 'is_duplicate', true);
  END IF;

  IF length(v_name) < 2 OR length(v_name) > 150 THEN
    RAISE EXCEPTION 'Nombre del cliente inválido' USING ERRCODE = 'P0001', HINT = 'JM_INVALID_CUSTOMER';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 150 THEN
    RAISE EXCEPTION 'Correo electrónico inválido' USING ERRCODE = 'P0001', HINT = 'JM_INVALID_EMAIL';
  END IF;
  IF length(v_phone) < 7 OR length(v_phone) > 15 THEN
    RAISE EXCEPTION 'Teléfono inválido' USING ERRCODE = 'P0001', HINT = 'JM_INVALID_PHONE';
  END IF;
  IF length(v_dept) < 2 OR length(v_city) < 2 OR length(v_addr) < 4
     OR length(v_dept) > 100 OR length(v_city) > 100 OR length(v_addr) > 255 THEN
    RAISE EXCEPTION 'Dirección de envío incompleta' USING ERRCODE = 'P0001', HINT = 'JM_INVALID_SHIPPING';
  END IF;
  IF v_branch IS NULL THEN
    RAISE EXCEPTION 'No hay bodega por defecto configurada' USING ERRCODE = 'P0001', HINT = 'JM_CONFIG';
  END IF;

  -- Precios desde BD + bloqueo de inventario (orden determinista)
  IF to_regclass('pg_temp._jm_lines') IS NULL THEN
    CREATE TEMP TABLE _jm_lines (
      variant_id uuid, product_id uuid, quantity int, unit_price bigint, product_name text, sku text,
      size_code text, color_name text, image_url text, inventory_id uuid, available int
    ) ON COMMIT DROP;
  ELSE
    TRUNCATE _jm_lines;
  END IF;
  INSERT INTO _jm_lines SELECT * FROM private.price_items(p_items, true);

  IF EXISTS (SELECT 1 FROM _jm_lines l WHERE l.inventory_id IS NULL OR l.available < l.quantity) THEN
    RAISE EXCEPTION 'Stock insuficiente: %',
      (SELECT string_agg(format('%s (talla %s, %s): disponibles %s, solicitadas %s',
                                l.product_name, l.size_code, l.color_name, GREATEST(COALESCE(l.available, 0), 0), l.quantity), '; ')
         FROM _jm_lines l WHERE l.inventory_id IS NULL OR l.available < l.quantity)
      USING ERRCODE = 'P0001', HINT = 'JM_OUT_OF_STOCK';
  END IF;

  SELECT SUM(l.unit_price * l.quantity), count(*) INTO v_subtotal, v_line_count FROM _jm_lines l;

  -- Cupón (bloqueado)
  IF COALESCE(btrim(p_coupon_code), '') <> '' THEN
    SELECT * INTO cpn FROM private.evaluate_coupon(p_coupon_code, v_subtotal, v_email, true);
    IF NOT cpn.is_valid THEN
      RAISE EXCEPTION 'Cupón no válido (%)', cpn.reason USING ERRCODE = 'P0001', HINT = 'JM_COUPON_' || cpn.reason;
    END IF;
    v_discount := cpn.discount_amount;
    v_free := cpn.free_shipping;
    v_coupon_ok := true;
    v_coupon_id := cpn.coupon_id;
    v_coupon_code := cpn.code;
  END IF;

  v_shipping := private.shipping_cost(p_shipping_method, v_subtotal - v_discount, v_free);

  INSERT INTO public.online_orders (
    idempotency_key, user_id, branch_id, customer_name, customer_email, customer_phone, customer_document,
    shipping_department, shipping_city, shipping_address, shipping_neighborhood, shipping_notes,
    shipping_method_code, subtotal, discount_total, shipping_cost, total, coupon_id, coupon_code,
    status, payment_expires_at)
  VALUES (
    v_key, auth.uid(), v_branch, v_name, v_email, v_phone, v_doc,
    v_dept, v_city, v_addr,
    NULLIF(left(btrim(COALESCE(p_shipping ->> 'neighborhood', '')), 100), ''),
    NULLIF(left(btrim(COALESCE(p_shipping ->> 'notes', '')), 500), ''),
    COALESCE(p_shipping_method, 'standard'), v_subtotal, v_discount, v_shipping,
    v_subtotal - v_discount + v_shipping,
    v_coupon_id, v_coupon_code,
    'payment_pending', v_expires)
  RETURNING * INTO v_order;

  -- Líneas con prorrateo del descuento (la última absorbe el redondeo)
  FOR ln IN SELECT * FROM _jm_lines ORDER BY variant_id LOOP
    v_i := v_i + 1;
    IF v_discount = 0 THEN
      v_line_disc := 0;
    ELSIF v_i = v_line_count THEN
      v_line_disc := v_discount - v_alloc;
    ELSE
      v_line_disc := floor(v_discount::numeric * (ln.unit_price * ln.quantity) / v_subtotal)::bigint;
    END IF;
    v_alloc := v_alloc + v_line_disc;

    INSERT INTO public.online_order_items (order_id, product_id, variant_id, product_name, sku, size_code, color_name,
                                           image_url, unit_price, quantity, line_discount, line_total)
    VALUES (v_order.id, ln.product_id, ln.variant_id, ln.product_name, ln.sku, ln.size_code, ln.color_name,
            ln.image_url, ln.unit_price, ln.quantity, v_line_disc, ln.unit_price * ln.quantity - v_line_disc);

    UPDATE public.inventories SET reserved = reserved + ln.quantity WHERE id = ln.inventory_id;
    INSERT INTO public.inventory_reservations (order_id, inventory_id, variant_id, quantity, expires_at)
    VALUES (v_order.id, ln.inventory_id, ln.variant_id, ln.quantity, v_expires);
  END LOOP;

  IF v_coupon_ok THEN
    INSERT INTO public.coupon_redemptions (coupon_id, order_id, customer_email, discount_amount)
    VALUES (v_coupon_id, v_order.id, v_email, v_discount);
  END IF;

  INSERT INTO public.order_events (order_id, event_type, from_status, to_status, actor, actor_user_id, metadata)
  VALUES (v_order.id, 'ORDER_CREATED', NULL, 'payment_pending',
          'customer', auth.uid(),
          jsonb_build_object('lines', v_line_count, 'coupon', v_order.coupon_code));

  RETURN jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number,
    'public_token', v_order.public_token, 'status', v_order.status,
    'subtotal', v_order.subtotal, 'discount_total', v_order.discount_total,
    'shipping_cost', v_order.shipping_cost, 'total', v_order.total,
    'amount_in_cents', v_order.total * 100, 'currency', 'COP',
    'payment_expires_at', v_order.payment_expires_at, 'is_duplicate', false);
END $_$;


--
-- Name: create_payment_attempt(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_payment_attempt(p_order_id uuid, p_public_token uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  o public.online_orders%ROWTYPE;
  v_attempt int;
  v_ref text;
BEGIN
  SELECT * INTO o FROM public.online_orders WHERE id = p_order_id AND public_token = p_public_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'P0001', HINT = 'JM_ORDER_NOT_FOUND';
  END IF;
  IF o.status <> 'payment_pending' THEN
    RAISE EXCEPTION 'El pedido no admite pagos en estado %', o.status USING ERRCODE = 'P0001', HINT = 'JM_ORDER_NOT_PAYABLE';
  END IF;
  IF o.payment_expires_at <= now() THEN
    RAISE EXCEPTION 'El tiempo para pagar este pedido expiró' USING ERRCODE = 'P0001', HINT = 'JM_PAYMENT_WINDOW_EXPIRED';
  END IF;
  SELECT COALESCE(max(attempt_number), 0) + 1 INTO v_attempt FROM public.payment_transactions WHERE order_id = o.id;
  IF v_attempt > 10 THEN
    RAISE EXCEPTION 'Se alcanzó el máximo de intentos de pago' USING ERRCODE = 'P0001', HINT = 'JM_TOO_MANY_ATTEMPTS';
  END IF;
  v_ref := o.order_number || '-' || v_attempt;
  INSERT INTO public.payment_transactions (order_id, attempt_number, reference, amount_in_cents)
  VALUES (o.id, v_attempt, v_ref, o.total * 100);
  INSERT INTO public.order_events (order_id, event_type, actor, metadata)
  VALUES (o.id, 'PAYMENT_ATTEMPT_CREATED', 'system', jsonb_build_object('reference', v_ref, 'attempt', v_attempt));
  RETURN jsonb_build_object('order_number', o.order_number, 'reference', v_ref, 'attempt_number', v_attempt,
                            'amount_in_cents', o.total * 100, 'currency', 'COP',
                            'customer_email', o.customer_email, 'payment_expires_at', o.payment_expires_at);
END $$;


--
-- Name: expire_pending_orders(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_pending_orders() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN SELECT id FROM public.online_orders
            WHERE status = 'payment_pending' AND payment_expires_at <= now()
            ORDER BY payment_expires_at
            FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM private.transition_order(r.id, 'expired', 'system', NULL, 'Ventana de pago vencida');
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;


--
-- Name: get_order_public(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_order_public(p_order_number text, p_public_token uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE o public.online_orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.online_orders
   WHERE order_number = p_order_number AND public_token = p_public_token;
  IF NOT FOUND THEN
    RETURN NULL;   -- no revela si el número existe
  END IF;
  RETURN jsonb_build_object(
    'order_number', o.order_number, 'status', o.status,
    'status_label', (SELECT label FROM public.order_status_catalog WHERE status = o.status),
    'created_at', o.created_at, 'paid_at', o.paid_at, 'shipped_at', o.shipped_at, 'delivered_at', o.delivered_at,
    'payment_expires_at', o.payment_expires_at,
    'customer_name', o.customer_name, 'customer_email', o.customer_email,
    'shipping', jsonb_build_object('department', o.shipping_department, 'city', o.shipping_city,
                                   'address', o.shipping_address, 'neighborhood', o.shipping_neighborhood,
                                   'method', o.shipping_method_code),
    'tracking', jsonb_build_object('carrier', o.carrier, 'tracking_number', o.tracking_number, 'tracking_url', o.tracking_url),
    'subtotal', o.subtotal, 'discount_total', o.discount_total, 'shipping_cost', o.shipping_cost, 'total', o.total,
    'coupon_code', o.coupon_code,
    'items', (SELECT jsonb_agg(jsonb_build_object('product_name', product_name, 'sku', sku, 'size_code', size_code,
                                                  'color_name', color_name, 'image_url', image_url, 'unit_price', unit_price,
                                                  'quantity', quantity, 'line_discount', line_discount, 'line_total', line_total)
                               ORDER BY product_name, size_code)
              FROM public.online_order_items WHERE order_id = o.id),
    'timeline', (SELECT jsonb_agg(jsonb_build_object('to_status', to_status, 'created_at', created_at) ORDER BY created_at)
                 FROM public.order_events WHERE order_id = o.id AND event_type IN ('ORDER_CREATED', 'STATUS_CHANGED')));
END $$;


--
-- Name: get_order_status_catalog(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_order_status_catalog() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
    'statuses', (SELECT jsonb_agg(jsonb_build_object('status', status, 'label', label, 'description', description,
                                                     'is_terminal', is_terminal, 'sort_order', sort_order) ORDER BY sort_order)
                 FROM public.order_status_catalog),
    'transitions', (SELECT jsonb_agg(jsonb_build_object('from', from_status, 'to', to_status, 'actor', allowed_actor,
                                                        'requires_note', requires_note) ORDER BY from_status, to_status)
                    FROM public.order_status_transitions)
  )
$$;


--
-- Name: is_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin(p_user_id uuid DEFAULT auth.uid()) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE((SELECT role IN ('admin', 'super_admin') FROM public.profiles WHERE id = p_user_id), false)
$$;


--
-- Name: is_super_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_super_admin(p_user_id uuid DEFAULT auth.uid()) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE((SELECT role = 'super_admin' FROM public.profiles WHERE id = p_user_id), false)
$$;


--
-- Name: quote_cart(jsonb, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.quote_cart(p_items jsonb, p_coupon_code text DEFAULT NULL::text, p_shipping_method text DEFAULT 'standard'::text, p_email text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_lines jsonb;
  v_subtotal bigint;
  v_can boolean;
  cpn record;
  v_discount bigint := 0;
  v_free boolean := false;
  v_shipping bigint;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
           'variant_id', pi.variant_id, 'product_id', pi.product_id, 'product_name', pi.product_name,
           'sku', pi.sku, 'size_code', pi.size_code, 'color_name', pi.color_name, 'image_url', pi.image_url,
           'unit_price', pi.unit_price, 'quantity', pi.quantity, 'line_total', pi.unit_price * pi.quantity,
           'available', pi.available, 'in_stock', pi.available >= pi.quantity) ORDER BY pi.variant_id),
         SUM(pi.unit_price * pi.quantity),
         bool_and(pi.available >= pi.quantity)
    INTO v_lines, v_subtotal, v_can
    FROM private.price_items(p_items, false) pi;

  SELECT * INTO cpn FROM private.evaluate_coupon(p_coupon_code, v_subtotal, p_email, false);
  IF cpn.is_valid THEN
    v_discount := cpn.discount_amount;
    v_free := cpn.free_shipping;
  END IF;
  v_shipping := private.shipping_cost(p_shipping_method, v_subtotal - v_discount, v_free);

  RETURN jsonb_build_object(
    'lines', v_lines, 'subtotal', v_subtotal, 'discount_total', v_discount, 'shipping_cost', v_shipping,
    'total', v_subtotal - v_discount + v_shipping, 'currency', 'COP',
    'coupon', CASE WHEN cpn.code IS NULL THEN NULL
                   ELSE jsonb_build_object('code', cpn.code, 'valid', cpn.is_valid, 'reason', cpn.reason) END,
    'can_checkout', v_can);
END $$;


--
-- Name: validate_coupon(text, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_coupon(p_code text, p_subtotal bigint, p_email text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM private.evaluate_coupon(p_code, GREATEST(COALESCE(p_subtotal, 0), 0), p_email, false);
  RETURN jsonb_build_object('code', r.code, 'valid', r.is_valid, 'reason', r.reason,
                            'discount_amount', r.discount_amount, 'free_shipping', r.free_shipping);
END $$;




--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id bigint NOT NULL,
    actor_user_id uuid,
    db_role text DEFAULT CURRENT_USER NOT NULL,
    table_name text NOT NULL,
    record_id text,
    action text NOT NULL,
    old_data jsonb,
    new_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_logs_action_check CHECK ((action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    address text,
    phone text,
    is_default boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    parent_id uuid,
    size_group public.size_group DEFAULT 'alpha'::public.size_group NOT NULL,
    image_url text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT categories_slug_check CHECK ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text))
);


--
-- Name: collection_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collection_products (
    collection_id uuid NOT NULL,
    product_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL
);


--
-- Name: collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    subtitle text,
    image_url text,
    kind text DEFAULT 'collection'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT collections_kind_check CHECK ((kind = ANY (ARRAY['collection'::text, 'look'::text]))),
    CONSTRAINT collections_slug_check CHECK ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text))
);


--
-- Name: colors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.colors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    hex_code text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT colors_hex_code_check CHECK ((hex_code ~ '^#[0-9A-Fa-f]{6}$'::text)),
    CONSTRAINT colors_slug_check CHECK ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text))
);


--
-- Name: coupon_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupon_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coupon_id uuid NOT NULL,
    order_id uuid NOT NULL,
    customer_email text NOT NULL,
    discount_amount bigint NOT NULL,
    status public.redemption_status DEFAULT 'reserved'::public.redemption_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT coupon_redemptions_discount_amount_check CHECK ((discount_amount >= 0))
);


--
-- Name: coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    description text,
    discount_type public.coupon_type NOT NULL,
    discount_value bigint DEFAULT 0 NOT NULL,
    min_subtotal bigint DEFAULT 0 NOT NULL,
    max_uses integer,
    max_uses_per_email integer,
    used_count integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    starts_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT coupons_code_check CHECK ((code ~ '^[A-Z0-9_-]{3,40}$'::text)),
    CONSTRAINT coupons_discount_value_check CHECK ((discount_value >= 0)),
    CONSTRAINT coupons_fixed_positive CHECK (((discount_type <> 'fixed'::public.coupon_type) OR (discount_value > 0))),
    CONSTRAINT coupons_max_uses_check CHECK (((max_uses IS NULL) OR (max_uses > 0))),
    CONSTRAINT coupons_max_uses_per_email_check CHECK (((max_uses_per_email IS NULL) OR (max_uses_per_email > 0))),
    CONSTRAINT coupons_min_subtotal_check CHECK ((min_subtotal >= 0)),
    CONSTRAINT coupons_percent_range CHECK (((discount_type <> 'percent'::public.coupon_type) OR ((discount_value >= 1) AND (discount_value <= 90)))),
    CONSTRAINT coupons_used_count_check CHECK ((used_count >= 0)),
    CONSTRAINT coupons_window CHECK (((expires_at IS NULL) OR (starts_at IS NULL) OR (expires_at > starts_at)))
);


--
-- Name: customer_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    recipient_name text NOT NULL,
    phone text NOT NULL,
    department text NOT NULL,
    city text NOT NULL,
    address_line text NOT NULL,
    neighborhood text,
    reference text,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_addresses_address_line_check CHECK (((length(address_line) >= 4) AND (length(address_line) <= 255))),
    CONSTRAINT customer_addresses_city_check CHECK (((length(city) >= 2) AND (length(city) <= 100))),
    CONSTRAINT customer_addresses_department_check CHECK (((length(department) >= 2) AND (length(department) <= 100))),
    CONSTRAINT customer_addresses_neighborhood_check CHECK (((neighborhood IS NULL) OR (length(neighborhood) <= 100))),
    CONSTRAINT customer_addresses_phone_check CHECK (((length(phone) >= 7) AND (length(phone) <= 30))),
    CONSTRAINT customer_addresses_recipient_name_check CHECK (((length(recipient_name) >= 2) AND (length(recipient_name) <= 150))),
    CONSTRAINT customer_addresses_reference_check CHECK (((reference IS NULL) OR (length(reference) <= 500)))
);


--
-- Name: inventories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    reserved integer DEFAULT 0 NOT NULL,
    min_stock integer DEFAULT 2 NOT NULL,
    location_shelf text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventories_min_stock_check CHECK ((min_stock >= 0)),
    CONSTRAINT inventories_reserved_check CHECK ((reserved >= 0)),
    CONSTRAINT inventories_reserved_le_stock CHECK ((reserved <= stock)),
    CONSTRAINT inventories_stock_check CHECK ((stock >= 0))
);


--
-- Name: inventory_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inventory_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    movement_type public.inventory_movement_type NOT NULL,
    quantity_change integer NOT NULL,
    quantity_before integer NOT NULL,
    quantity_after integer NOT NULL,
    reason text,
    reference_type text,
    reference_id uuid,
    actor_user_id uuid,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT inventory_movements_arithmetic CHECK ((quantity_after = (quantity_before + quantity_change))),
    CONSTRAINT inventory_movements_quantity_after_check CHECK ((quantity_after >= 0)),
    CONSTRAINT inventory_movements_quantity_before_check CHECK ((quantity_before >= 0)),
    CONSTRAINT inventory_movements_quantity_change_check CHECK ((quantity_change <> 0)),
    CONSTRAINT inventory_movements_reference_type_check CHECK ((reference_type = ANY (ARRAY['order'::text, 'manual'::text, 'product_setup'::text])))
);


--
-- Name: inventory_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    inventory_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    quantity integer NOT NULL,
    status public.reservation_status DEFAULT 'active'::public.reservation_status NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_reservations_quantity_check CHECK ((quantity > 0))
);


--
-- Name: occasions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.occasions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    subtitle text,
    image_url text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT occasions_slug_check CHECK ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text))
);


--
-- Name: online_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.online_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    product_name text NOT NULL,
    sku text NOT NULL,
    size_code text NOT NULL,
    color_name text NOT NULL,
    image_url text,
    unit_price bigint NOT NULL,
    quantity integer NOT NULL,
    line_discount bigint DEFAULT 0 NOT NULL,
    line_total bigint NOT NULL,
    CONSTRAINT online_order_items_arithmetic CHECK ((line_total = ((unit_price * quantity) - line_discount))),
    CONSTRAINT online_order_items_discount_le_gross CHECK ((line_discount <= (unit_price * quantity))),
    CONSTRAINT online_order_items_line_discount_check CHECK ((line_discount >= 0)),
    CONSTRAINT online_order_items_quantity_check CHECK (((quantity >= 1) AND (quantity <= 20))),
    CONSTRAINT online_order_items_unit_price_check CHECK ((unit_price > 0))
);


--
-- Name: order_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_number_seq
    START WITH 1000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: online_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.online_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_number text DEFAULT ('JM-'::text || lpad((nextval('public.order_number_seq'::regclass))::text, 6, '0'::text)) NOT NULL,
    public_token uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key text NOT NULL,
    user_id uuid,
    branch_id uuid NOT NULL,
    customer_name text NOT NULL,
    customer_email text NOT NULL,
    customer_phone text NOT NULL,
    customer_document text,
    shipping_department text NOT NULL,
    shipping_city text NOT NULL,
    shipping_address text NOT NULL,
    shipping_neighborhood text,
    shipping_notes text,
    shipping_method_code text NOT NULL,
    payment_method public.payment_method DEFAULT 'wompi'::public.payment_method NOT NULL,
    currency character(3) DEFAULT 'COP'::bpchar NOT NULL,
    subtotal bigint NOT NULL,
    discount_total bigint DEFAULT 0 NOT NULL,
    shipping_cost bigint DEFAULT 0 NOT NULL,
    total bigint NOT NULL,
    coupon_id uuid,
    coupon_code text,
    status public.order_status DEFAULT 'payment_pending'::public.order_status NOT NULL,
    payment_expires_at timestamp with time zone NOT NULL,
    carrier text,
    tracking_number text,
    tracking_url text,
    paid_at timestamp with time zone,
    shipped_at timestamp with time zone,
    delivered_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    cancel_reason text,
    needs_attention boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT online_orders_check CHECK (((discount_total >= 0) AND (discount_total <= subtotal))),
    CONSTRAINT online_orders_coupon_snapshot CHECK (((coupon_id IS NULL) = (coupon_code IS NULL))),
    CONSTRAINT online_orders_currency_check CHECK ((currency = 'COP'::bpchar)),
    CONSTRAINT online_orders_customer_email_check CHECK ((customer_email = lower(customer_email))),
    CONSTRAINT online_orders_idempotency_key_check CHECK (((length(idempotency_key) >= 8) AND (length(idempotency_key) <= 150))),
    CONSTRAINT online_orders_shipping_cost_check CHECK ((shipping_cost >= 0)),
    CONSTRAINT online_orders_subtotal_check CHECK ((subtotal > 0)),
    CONSTRAINT online_orders_total_arithmetic CHECK ((total = ((subtotal - discount_total) + shipping_cost))),
    CONSTRAINT online_orders_tracking_url_check CHECK (((tracking_url IS NULL) OR (tracking_url ~ '^https://'::text)))
);


--
-- Name: order_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    event_type text NOT NULL,
    from_status public.order_status,
    to_status public.order_status,
    actor public.event_actor NOT NULL,
    actor_user_id uuid,
    note text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


--
-- Name: order_refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    payment_transaction_id uuid,
    amount bigint NOT NULL,
    reason text NOT NULL,
    status public.refund_status DEFAULT 'requested'::public.refund_status NOT NULL,
    provider_refund_id text,
    restock boolean DEFAULT false NOT NULL,
    requested_by uuid,
    processed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_refunds_amount_check CHECK ((amount > 0))
);


--
-- Name: order_status_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_status_catalog (
    status public.order_status NOT NULL,
    label text NOT NULL,
    description text,
    is_terminal boolean NOT NULL,
    sort_order integer NOT NULL
);


--
-- Name: order_status_transitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_status_transitions (
    from_status public.order_status NOT NULL,
    to_status public.order_status NOT NULL,
    allowed_actor public.event_actor NOT NULL,
    requires_note boolean DEFAULT false NOT NULL,
    CONSTRAINT order_status_transitions_check CHECK ((from_status <> to_status))
);


--
-- Name: payment_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    provider text DEFAULT 'wompi'::text NOT NULL,
    attempt_number integer NOT NULL,
    reference text NOT NULL,
    provider_transaction_id text,
    amount_in_cents bigint NOT NULL,
    currency character(3) DEFAULT 'COP'::bpchar NOT NULL,
    payment_method_type text,
    status public.payment_status DEFAULT 'PENDING'::public.payment_status NOT NULL,
    status_message text,
    requires_refund boolean DEFAULT false NOT NULL,
    last_event_at timestamp with time zone,
    raw_last_event jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_transactions_amount_in_cents_check CHECK ((amount_in_cents > 0)),
    CONSTRAINT payment_transactions_attempt_number_check CHECK (((attempt_number >= 1) AND (attempt_number <= 10))),
    CONSTRAINT payment_transactions_provider_check CHECK ((provider = 'wompi'::text))
);


--
-- Name: product_colors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_colors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    color_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_default boolean DEFAULT false NOT NULL
);


--
-- Name: product_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    color_id uuid,
    storage_path text,
    external_url text,
    alt_text text,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_images_external_url_check CHECK (((external_url IS NULL) OR (external_url ~ '^https://'::text))),
    CONSTRAINT product_images_one_source CHECK ((num_nonnulls(storage_path, external_url) = 1)),
    CONSTRAINT product_images_storage_path_check CHECK (((storage_path IS NULL) OR (storage_path ~ '^[a-z0-9/_.-]+$'::text)))
);


--
-- Name: product_occasions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_occasions (
    product_id uuid NOT NULL,
    occasion_id uuid NOT NULL
);


--
-- Name: product_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    order_item_id uuid,
    user_id uuid,
    author_name text NOT NULL,
    city text,
    rating integer NOT NULL,
    title text NOT NULL,
    comment text NOT NULL,
    is_verified_buyer boolean GENERATED ALWAYS AS ((order_item_id IS NOT NULL)) STORED,
    status public.review_status DEFAULT 'pending'::public.review_status NOT NULL,
    admin_reply text,
    moderated_by uuid,
    moderated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reference text NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    details text[] DEFAULT '{}'::text[] NOT NULL,
    fit public.product_fit DEFAULT 'REGULAR'::public.product_fit NOT NULL,
    fit_description text,
    category_id uuid NOT NULL,
    style_line_id uuid,
    brand_id uuid,
    base_price bigint NOT NULL,
    compare_at_price bigint,
    base_cost bigint,
    status public.product_status DEFAULT 'draft'::public.product_status NOT NULL,
    is_featured_new boolean DEFAULT false NOT NULL,
    is_bestseller boolean DEFAULT false NOT NULL,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT products_active_requires_published CHECK (((status <> 'active'::public.product_status) OR (published_at IS NOT NULL))),
    CONSTRAINT products_base_cost_check CHECK (((base_cost IS NULL) OR (base_cost >= 0))),
    CONSTRAINT products_base_price_check CHECK ((base_price > 0)),
    CONSTRAINT products_check CHECK (((compare_at_price IS NULL) OR (compare_at_price > base_price))),
    CONSTRAINT products_name_check CHECK (((length(name) >= 2) AND (length(name) <= 150))),
    CONSTRAINT products_reference_check CHECK ((reference ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$'::text)),
    CONSTRAINT products_slug_check CHECK ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    full_name text,
    phone text,
    avatar_url text,
    role public.app_role DEFAULT 'customer'::public.app_role NOT NULL,
    preferred_size text,
    preferred_fit public.product_fit,
    marketing_opt_in boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profiles_full_name_check CHECK (((full_name IS NULL) OR (length(full_name) <= 150))),
    CONSTRAINT profiles_phone_check CHECK (((phone IS NULL) OR (length(phone) <= 30))),
    CONSTRAINT profiles_preferred_size_check CHECK (((preferred_size IS NULL) OR (length(preferred_size) <= 10)))
);


--
-- Name: shipping_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipping_methods (
    code text NOT NULL,
    name text NOT NULL,
    cost bigint NOT NULL,
    free_over_subtotal bigint,
    eta_text text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT shipping_methods_active_needs_cost CHECK (((NOT is_active) OR (cost > 0))),
    CONSTRAINT shipping_methods_code_check CHECK ((code ~ '^[a-z_]+$'::text)),
    CONSTRAINT shipping_methods_cost_check CHECK ((cost >= 0)),
    CONSTRAINT shipping_methods_free_over_subtotal_check CHECK (((free_over_subtotal IS NULL) OR (free_over_subtotal > 0)))
);


--
-- Name: site_content; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_content (
    key text NOT NULL,
    image_url text,
    storage_path text,
    alt_text text,
    title text,
    body text,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT site_content_key_check CHECK ((key ~ '^[a-z0-9_]+$'::text))
);


--
-- Name: sizes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sizes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    size_group public.size_group NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT sizes_code_check CHECK ((code ~ '^[A-Z0-9]{1,6}$'::text))
);


--
-- Name: style_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.style_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    tagline text,
    description text,
    badge text,
    image_url text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT style_lines_slug_check CHECK ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text))
);


--
-- Name: v_product_rating; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_product_rating WITH (security_invoker='true') AS
 SELECT product_reviews.product_id,
    round(avg(product_reviews.rating), 1) AS rating,
    (count(*))::integer AS review_count
   FROM public.product_reviews
  WHERE (product_reviews.status = 'approved'::public.review_status)
  GROUP BY product_reviews.product_id;


--
-- Name: v_variant_availability; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_variant_availability AS
SELECT
    NULL::uuid AS variant_id,
    NULL::uuid AS product_id,
    NULL::uuid AS color_id,
    NULL::uuid AS size_id,
    NULL::integer AS available;


--
-- Name: variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    color_id uuid NOT NULL,
    size_id uuid NOT NULL,
    sku text NOT NULL,
    barcode text,
    price_override bigint,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT variants_price_override_check CHECK (((price_override IS NULL) OR (price_override > 0))),
    CONSTRAINT variants_sku_check CHECK ((sku ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$'::text))
);


--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text DEFAULT 'wompi'::text NOT NULL,
    event_checksum text NOT NULL,
    event_type text,
    provider_transaction_id text,
    reference text,
    payload jsonb NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    result text,
    detail text,
    CONSTRAINT webhook_events_result_check CHECK ((result = ANY (ARRAY['applied'::text, 'ignored'::text, 'rejected'::text])))
);


--
-- Name: wishlist_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wishlist_items (
    user_id uuid NOT NULL,
    product_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: branches branches_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_code_key UNIQUE (code);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: brands brands_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_name_key UNIQUE (name);


--
-- Name: brands brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_slug_key UNIQUE (slug);


--
-- Name: collection_products collection_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_products
    ADD CONSTRAINT collection_products_pkey PRIMARY KEY (collection_id, product_id);


--
-- Name: collections collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_pkey PRIMARY KEY (id);


--
-- Name: collections collections_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_slug_key UNIQUE (slug);


--
-- Name: colors colors_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.colors
    ADD CONSTRAINT colors_name_key UNIQUE (name);


--
-- Name: colors colors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.colors
    ADD CONSTRAINT colors_pkey PRIMARY KEY (id);


--
-- Name: colors colors_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.colors
    ADD CONSTRAINT colors_slug_key UNIQUE (slug);


--
-- Name: coupon_redemptions coupon_redemptions_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_order_id_key UNIQUE (order_id);


--
-- Name: coupon_redemptions coupon_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_pkey PRIMARY KEY (id);


--
-- Name: coupons coupons_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_code_key UNIQUE (code);


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);


--
-- Name: customer_addresses customer_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_addresses
    ADD CONSTRAINT customer_addresses_pkey PRIMARY KEY (id);


--
-- Name: inventories inventories_branch_id_variant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventories
    ADD CONSTRAINT inventories_branch_id_variant_id_key UNIQUE (branch_id, variant_id);


--
-- Name: inventories inventories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventories
    ADD CONSTRAINT inventories_pkey PRIMARY KEY (id);


--
-- Name: inventory_movements inventory_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_pkey PRIMARY KEY (id);


--
-- Name: inventory_reservations inventory_reservations_order_id_inventory_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reservations
    ADD CONSTRAINT inventory_reservations_order_id_inventory_id_key UNIQUE (order_id, inventory_id);


--
-- Name: inventory_reservations inventory_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reservations
    ADD CONSTRAINT inventory_reservations_pkey PRIMARY KEY (id);


--
-- Name: occasions occasions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occasions
    ADD CONSTRAINT occasions_pkey PRIMARY KEY (id);


--
-- Name: occasions occasions_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occasions
    ADD CONSTRAINT occasions_slug_key UNIQUE (slug);


--
-- Name: online_order_items online_order_items_order_id_variant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_order_items
    ADD CONSTRAINT online_order_items_order_id_variant_id_key UNIQUE (order_id, variant_id);


--
-- Name: online_order_items online_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_order_items
    ADD CONSTRAINT online_order_items_pkey PRIMARY KEY (id);


--
-- Name: online_orders online_orders_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_orders
    ADD CONSTRAINT online_orders_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: online_orders online_orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_orders
    ADD CONSTRAINT online_orders_order_number_key UNIQUE (order_number);


--
-- Name: online_orders online_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_orders
    ADD CONSTRAINT online_orders_pkey PRIMARY KEY (id);


--
-- Name: online_orders online_orders_public_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_orders
    ADD CONSTRAINT online_orders_public_token_key UNIQUE (public_token);


--
-- Name: order_events order_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_events
    ADD CONSTRAINT order_events_pkey PRIMARY KEY (id);


--
-- Name: order_refunds order_refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_refunds
    ADD CONSTRAINT order_refunds_pkey PRIMARY KEY (id);


--
-- Name: order_status_catalog order_status_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_catalog
    ADD CONSTRAINT order_status_catalog_pkey PRIMARY KEY (status);


--
-- Name: order_status_transitions order_status_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_transitions
    ADD CONSTRAINT order_status_transitions_pkey PRIMARY KEY (from_status, to_status, allowed_actor);


--
-- Name: payment_transactions payment_transactions_order_id_attempt_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_order_id_attempt_number_key UNIQUE (order_id, attempt_number);


--
-- Name: payment_transactions payment_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_pkey PRIMARY KEY (id);


--
-- Name: payment_transactions payment_transactions_provider_transaction_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_provider_transaction_id_key UNIQUE (provider_transaction_id);


--
-- Name: payment_transactions payment_transactions_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_reference_key UNIQUE (reference);


--
-- Name: product_colors product_colors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_colors
    ADD CONSTRAINT product_colors_pkey PRIMARY KEY (id);


--
-- Name: product_colors product_colors_product_id_color_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_colors
    ADD CONSTRAINT product_colors_product_id_color_id_key UNIQUE (product_id, color_id);


--
-- Name: product_images product_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_pkey PRIMARY KEY (id);


--
-- Name: product_occasions product_occasions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_occasions
    ADD CONSTRAINT product_occasions_pkey PRIMARY KEY (product_id, occasion_id);


--
-- Name: product_reviews product_reviews_order_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_order_item_id_key UNIQUE (order_item_id);


--
-- Name: product_reviews product_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_reference_key UNIQUE (reference);


--
-- Name: products products_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_slug_key UNIQUE (slug);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: shipping_methods shipping_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_methods
    ADD CONSTRAINT shipping_methods_pkey PRIMARY KEY (code);


--
-- Name: site_content site_content_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_content
    ADD CONSTRAINT site_content_pkey PRIMARY KEY (key);


--
-- Name: sizes sizes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sizes
    ADD CONSTRAINT sizes_pkey PRIMARY KEY (id);


--
-- Name: sizes sizes_size_group_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sizes
    ADD CONSTRAINT sizes_size_group_code_key UNIQUE (size_group, code);


--
-- Name: style_lines style_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.style_lines
    ADD CONSTRAINT style_lines_pkey PRIMARY KEY (id);


--
-- Name: style_lines style_lines_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.style_lines
    ADD CONSTRAINT style_lines_slug_key UNIQUE (slug);


--
-- Name: variants variants_barcode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variants
    ADD CONSTRAINT variants_barcode_key UNIQUE (barcode);


--
-- Name: variants variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variants
    ADD CONSTRAINT variants_pkey PRIMARY KEY (id);


--
-- Name: variants variants_product_id_color_id_size_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variants
    ADD CONSTRAINT variants_product_id_color_id_size_id_key UNIQUE (product_id, color_id, size_id);


--
-- Name: variants variants_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variants
    ADD CONSTRAINT variants_sku_key UNIQUE (sku);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);


--
-- Name: webhook_events webhook_events_provider_event_checksum_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_provider_event_checksum_key UNIQUE (provider, event_checksum);


--
-- Name: wishlist_items wishlist_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlist_items
    ADD CONSTRAINT wishlist_items_pkey PRIMARY KEY (user_id, product_id);


--
-- Name: idx_audit_logs_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_table ON public.audit_logs USING btree (table_name, created_at DESC);


--
-- Name: idx_collection_products_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collection_products_product ON public.collection_products USING btree (product_id);


--
-- Name: idx_coupon_redemptions_coupon; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupon_redemptions_coupon ON public.coupon_redemptions USING btree (coupon_id, status);


--
-- Name: idx_coupon_redemptions_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupon_redemptions_email ON public.coupon_redemptions USING btree (coupon_id, customer_email);


--
-- Name: idx_customer_addresses_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_addresses_user ON public.customer_addresses USING btree (user_id);


--
-- Name: idx_inventories_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventories_variant ON public.inventories USING btree (variant_id);


--
-- Name: idx_inventory_movements_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_movements_variant ON public.inventory_movements USING btree (variant_id, created_at);


--
-- Name: idx_online_order_items_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_order_items_product ON public.online_order_items USING btree (product_id);


--
-- Name: idx_online_order_items_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_order_items_variant ON public.online_order_items USING btree (variant_id);


--
-- Name: idx_online_orders_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_orders_branch ON public.online_orders USING btree (branch_id);


--
-- Name: idx_online_orders_coupon; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_orders_coupon ON public.online_orders USING btree (coupon_id);


--
-- Name: idx_online_orders_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_orders_email ON public.online_orders USING btree (customer_email);


--
-- Name: idx_online_orders_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_orders_expiry ON public.online_orders USING btree (payment_expires_at) WHERE (status = 'payment_pending'::public.order_status);


--
-- Name: idx_online_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_orders_status ON public.online_orders USING btree (status, created_at DESC);


--
-- Name: idx_online_orders_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_orders_user ON public.online_orders USING btree (user_id, created_at DESC);


--
-- Name: idx_order_events_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_events_order ON public.order_events USING btree (order_id, created_at);


--
-- Name: idx_order_refunds_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_refunds_order ON public.order_refunds USING btree (order_id);


--
-- Name: idx_order_refunds_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_refunds_payment ON public.order_refunds USING btree (payment_transaction_id);


--
-- Name: idx_product_colors_color; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_colors_color ON public.product_colors USING btree (color_id);


--
-- Name: idx_product_images_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_images_gallery ON public.product_images USING btree (product_id, color_id, "position");


--
-- Name: idx_product_occasions_occasion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_occasions_occasion ON public.product_occasions USING btree (occasion_id);


--
-- Name: idx_product_reviews_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_reviews_product ON public.product_reviews USING btree (product_id, status);


--
-- Name: idx_products_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_category ON public.products USING btree (category_id);


--
-- Name: idx_products_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_status ON public.products USING btree (status);


--
-- Name: idx_products_style_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_style_line ON public.products USING btree (style_line_id);


--
-- Name: idx_profiles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_role ON public.profiles USING btree (role) WHERE (role <> 'customer'::public.app_role);


--
-- Name: idx_reservations_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservations_active ON public.inventory_reservations USING btree (expires_at) WHERE (status = 'active'::public.reservation_status);


--
-- Name: idx_reservations_inventory; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservations_inventory ON public.inventory_reservations USING btree (inventory_id);


--
-- Name: idx_variants_size; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_size ON public.variants USING btree (size_id);


--
-- Name: idx_webhook_events_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_events_reference ON public.webhook_events USING btree (reference);


--
-- Name: idx_wishlist_items_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wishlist_items_product ON public.wishlist_items USING btree (product_id);


--
-- Name: uq_branches_single_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_branches_single_default ON public.branches USING btree ((true)) WHERE is_default;


--
-- Name: uq_customer_addresses_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_customer_addresses_default ON public.customer_addresses USING btree (user_id) WHERE is_default;


--
-- Name: uq_inventory_movements_order; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_inventory_movements_order ON public.inventory_movements USING btree (reference_id, variant_id, movement_type) WHERE (reference_type = 'order'::text);


--
-- Name: uq_payment_transactions_one_approved; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_payment_transactions_one_approved ON public.payment_transactions USING btree (order_id) WHERE ((status = 'APPROVED'::public.payment_status) AND (NOT requires_refund));


--
-- Name: uq_product_colors_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_product_colors_default ON public.product_colors USING btree (product_id) WHERE is_default;


--
-- Name: v_variant_availability _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.v_variant_availability WITH (security_barrier='true') AS
 SELECT v.id AS variant_id,
    v.product_id,
    v.color_id,
    v.size_id,
    (GREATEST(COALESCE(sum((i.stock - i.reserved)), (0)::bigint), (0)::bigint))::integer AS available
   FROM ((public.variants v
     JOIN public.products p ON (((p.id = v.product_id) AND (p.status = 'active'::public.product_status))))
     LEFT JOIN public.inventories i ON ((i.variant_id = v.id)))
  WHERE v.is_active
  GROUP BY v.id;


--
-- Name: audit_logs trg_audit_logs_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_logs_append_only BEFORE DELETE OR UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION private.forbid_mutation();


--
-- Name: branches trg_branches_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_branches_audit AFTER INSERT OR DELETE OR UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();


--
-- Name: branches trg_branches_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_branches_updated_at BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: categories trg_categories_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: coupon_redemptions trg_coupon_redemptions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_coupon_redemptions_updated_at BEFORE UPDATE ON public.coupon_redemptions FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: coupons trg_coupons_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_coupons_audit AFTER INSERT OR DELETE OR UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();


--
-- Name: coupons trg_coupons_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_coupons_updated_at BEFORE UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: customer_addresses trg_customer_addresses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_customer_addresses_updated_at BEFORE UPDATE ON public.customer_addresses FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: inventories trg_inventories_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_inventories_updated_at BEFORE UPDATE ON public.inventories FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: inventory_movements trg_inventory_movements_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_inventory_movements_append_only BEFORE DELETE OR UPDATE ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION private.forbid_mutation();


--
-- Name: inventory_reservations trg_inventory_reservations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_inventory_reservations_updated_at BEFORE UPDATE ON public.inventory_reservations FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: online_orders trg_online_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_online_orders_updated_at BEFORE UPDATE ON public.online_orders FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: order_events trg_order_events_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_order_events_append_only BEFORE DELETE OR UPDATE ON public.order_events FOR EACH ROW EXECUTE FUNCTION private.forbid_mutation();


--
-- Name: order_refunds trg_order_refunds_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_order_refunds_updated_at BEFORE UPDATE ON public.order_refunds FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: payment_transactions trg_payment_transactions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payment_transactions_updated_at BEFORE UPDATE ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: product_colors trg_product_colors_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_product_colors_audit AFTER INSERT OR DELETE OR UPDATE ON public.product_colors FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();


--
-- Name: products trg_products_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_products_audit AFTER INSERT OR DELETE OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();


--
-- Name: products trg_products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: profiles trg_profiles_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_audit AFTER INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();


--
-- Name: profiles trg_profiles_guard_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_guard_role BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.guard_profile_role();


--
-- Name: profiles trg_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: shipping_methods trg_shipping_methods_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_shipping_methods_audit AFTER INSERT OR DELETE OR UPDATE ON public.shipping_methods FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();


--
-- Name: style_lines trg_style_lines_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_style_lines_updated_at BEFORE UPDATE ON public.style_lines FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: variants trg_variants_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_variants_audit AFTER INSERT OR DELETE OR UPDATE ON public.variants FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();


--
-- Name: variants trg_variants_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_variants_updated_at BEFORE UPDATE ON public.variants FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: categories categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.categories(id) ON DELETE RESTRICT;


--
-- Name: collection_products collection_products_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_products
    ADD CONSTRAINT collection_products_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON DELETE CASCADE;


--
-- Name: collection_products collection_products_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_products
    ADD CONSTRAINT collection_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: coupon_redemptions coupon_redemptions_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON DELETE RESTRICT;


--
-- Name: coupon_redemptions coupon_redemptions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.online_orders(id) ON DELETE RESTRICT;


--
-- Name: customer_addresses customer_addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_addresses
    ADD CONSTRAINT customer_addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: inventories inventories_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventories
    ADD CONSTRAINT inventories_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT;


--
-- Name: inventories inventories_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventories
    ADD CONSTRAINT inventories_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.variants(id) ON DELETE RESTRICT;


--
-- Name: inventory_movements inventory_movements_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: inventory_movements inventory_movements_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT;


--
-- Name: inventory_movements inventory_movements_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.inventories(id) ON DELETE RESTRICT;


--
-- Name: inventory_movements inventory_movements_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.variants(id) ON DELETE RESTRICT;


--
-- Name: inventory_reservations inventory_reservations_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reservations
    ADD CONSTRAINT inventory_reservations_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.inventories(id) ON DELETE RESTRICT;


--
-- Name: inventory_reservations inventory_reservations_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reservations
    ADD CONSTRAINT inventory_reservations_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.online_orders(id) ON DELETE RESTRICT;


--
-- Name: inventory_reservations inventory_reservations_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reservations
    ADD CONSTRAINT inventory_reservations_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.variants(id) ON DELETE RESTRICT;


--
-- Name: online_order_items online_order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_order_items
    ADD CONSTRAINT online_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.online_orders(id) ON DELETE RESTRICT;


--
-- Name: online_order_items online_order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_order_items
    ADD CONSTRAINT online_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: online_order_items online_order_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_order_items
    ADD CONSTRAINT online_order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.variants(id) ON DELETE RESTRICT;


--
-- Name: online_orders online_orders_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_orders
    ADD CONSTRAINT online_orders_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT;


--
-- Name: online_orders online_orders_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_orders
    ADD CONSTRAINT online_orders_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON DELETE RESTRICT;


--
-- Name: online_orders online_orders_shipping_method_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_orders
    ADD CONSTRAINT online_orders_shipping_method_code_fkey FOREIGN KEY (shipping_method_code) REFERENCES public.shipping_methods(code);


--
-- Name: online_orders online_orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_orders
    ADD CONSTRAINT online_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: order_events order_events_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_events
    ADD CONSTRAINT order_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: order_events order_events_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_events
    ADD CONSTRAINT order_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.online_orders(id) ON DELETE RESTRICT;


--
-- Name: order_refunds order_refunds_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_refunds
    ADD CONSTRAINT order_refunds_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.online_orders(id) ON DELETE RESTRICT;


--
-- Name: order_refunds order_refunds_payment_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_refunds
    ADD CONSTRAINT order_refunds_payment_transaction_id_fkey FOREIGN KEY (payment_transaction_id) REFERENCES public.payment_transactions(id) ON DELETE RESTRICT;


--
-- Name: order_refunds order_refunds_processed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_refunds
    ADD CONSTRAINT order_refunds_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: order_refunds order_refunds_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_refunds
    ADD CONSTRAINT order_refunds_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: payment_transactions payment_transactions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.online_orders(id) ON DELETE RESTRICT;


--
-- Name: product_colors product_colors_color_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_colors
    ADD CONSTRAINT product_colors_color_id_fkey FOREIGN KEY (color_id) REFERENCES public.colors(id) ON DELETE RESTRICT;


--
-- Name: product_colors product_colors_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_colors
    ADD CONSTRAINT product_colors_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_images product_images_color_declared; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_color_declared FOREIGN KEY (product_id, color_id) REFERENCES public.product_colors(product_id, color_id) ON DELETE CASCADE;


--
-- Name: product_images product_images_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_occasions product_occasions_occasion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_occasions
    ADD CONSTRAINT product_occasions_occasion_id_fkey FOREIGN KEY (occasion_id) REFERENCES public.occasions(id) ON DELETE CASCADE;


--
-- Name: product_occasions product_occasions_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_occasions
    ADD CONSTRAINT product_occasions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_reviews product_reviews_moderated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_moderated_by_fkey FOREIGN KEY (moderated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: product_reviews product_reviews_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.online_order_items(id) ON DELETE SET NULL;


--
-- Name: product_reviews product_reviews_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_reviews product_reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: products products_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT;


--
-- Name: products products_style_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_style_line_id_fkey FOREIGN KEY (style_line_id) REFERENCES public.style_lines(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: site_content site_content_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_content
    ADD CONSTRAINT site_content_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: variants variants_color_declared; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variants
    ADD CONSTRAINT variants_color_declared FOREIGN KEY (product_id, color_id) REFERENCES public.product_colors(product_id, color_id) ON DELETE RESTRICT;


--
-- Name: variants variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variants
    ADD CONSTRAINT variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: variants variants_size_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variants
    ADD CONSTRAINT variants_size_id_fkey FOREIGN KEY (size_id) REFERENCES public.sizes(id) ON DELETE RESTRICT;


--
-- Name: wishlist_items wishlist_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlist_items
    ADD CONSTRAINT wishlist_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: wishlist_items wishlist_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlist_items
    ADD CONSTRAINT wishlist_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_logs_super_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_super_read ON public.audit_logs FOR SELECT TO authenticated USING (public.is_super_admin());


--
-- Name: branches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

--
-- Name: branches branches_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branches_admin_read ON public.branches FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: branches branches_super_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branches_super_write ON public.branches TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: brands; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

--
-- Name: brands brands_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brands_admin ON public.brands TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: brands brands_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brands_read ON public.brands FOR SELECT USING (true);


--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: categories categories_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_admin ON public.categories TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: categories categories_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_read ON public.categories FOR SELECT USING ((is_active OR public.is_admin()));


--
-- Name: collection_products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.collection_products ENABLE ROW LEVEL SECURITY;

--
-- Name: collection_products collection_products_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY collection_products_admin ON public.collection_products TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: collection_products collection_products_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY collection_products_read ON public.collection_products FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.collections c
  WHERE (c.id = collection_products.collection_id))) AND (EXISTS ( SELECT 1
   FROM public.products p
  WHERE (p.id = collection_products.product_id)))));


--
-- Name: collections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

--
-- Name: collections collections_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY collections_admin ON public.collections TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: collections collections_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY collections_read ON public.collections FOR SELECT USING ((is_active OR public.is_admin()));


--
-- Name: colors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.colors ENABLE ROW LEVEL SECURITY;

--
-- Name: colors colors_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY colors_admin ON public.colors TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: colors colors_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY colors_read ON public.colors FOR SELECT USING (true);


--
-- Name: coupon_redemptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

--
-- Name: coupon_redemptions coupon_redemptions_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coupon_redemptions_admin_read ON public.coupon_redemptions FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: coupons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

--
-- Name: coupons coupons_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coupons_admin ON public.coupons TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: customer_addresses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_addresses customer_addresses_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_addresses_admin_read ON public.customer_addresses FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: customer_addresses customer_addresses_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_addresses_own ON public.customer_addresses TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: inventories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventories ENABLE ROW LEVEL SECURITY;

--
-- Name: inventories inventories_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventories_admin_read ON public.inventories FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: inventory_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_movements inventory_movements_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_movements_admin_read ON public.inventory_movements FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: inventory_reservations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_reservations inventory_reservations_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_reservations_admin_read ON public.inventory_reservations FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: occasions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.occasions ENABLE ROW LEVEL SECURITY;

--
-- Name: occasions occasions_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY occasions_admin ON public.occasions TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: occasions occasions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY occasions_read ON public.occasions FOR SELECT USING ((is_active OR public.is_admin()));


--
-- Name: online_order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.online_order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: online_order_items online_order_items_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY online_order_items_read ON public.online_order_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.online_orders o
  WHERE (o.id = online_order_items.order_id))));


--
-- Name: online_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.online_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: online_orders online_orders_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY online_orders_read ON public.online_orders FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_admin()));


--
-- Name: order_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

--
-- Name: order_events order_events_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_events_read ON public.order_events FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.online_orders o
  WHERE (o.id = order_events.order_id))));


--
-- Name: order_refunds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_refunds ENABLE ROW LEVEL SECURITY;

--
-- Name: order_refunds order_refunds_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_refunds_read ON public.order_refunds FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.online_orders o
  WHERE (o.id = order_refunds.order_id))));


--
-- Name: order_status_catalog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_status_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: order_status_catalog order_status_catalog_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_status_catalog_read ON public.order_status_catalog FOR SELECT USING (true);


--
-- Name: order_status_transitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_status_transitions ENABLE ROW LEVEL SECURITY;

--
-- Name: order_status_transitions order_status_transitions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_status_transitions_read ON public.order_status_transitions FOR SELECT USING (true);


--
-- Name: payment_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_transactions payment_transactions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payment_transactions_read ON public.payment_transactions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.online_orders o
  WHERE (o.id = payment_transactions.order_id))));


--
-- Name: product_colors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_colors ENABLE ROW LEVEL SECURITY;

--
-- Name: product_colors product_colors_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_colors_admin ON public.product_colors TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: product_colors product_colors_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_colors_read ON public.product_colors FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.products p
  WHERE (p.id = product_colors.product_id))));


--
-- Name: product_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

--
-- Name: product_images product_images_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_images_admin ON public.product_images TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: product_images product_images_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_images_read ON public.product_images FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.products p
  WHERE (p.id = product_images.product_id))));


--
-- Name: product_occasions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_occasions ENABLE ROW LEVEL SECURITY;

--
-- Name: product_occasions product_occasions_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_occasions_admin ON public.product_occasions TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: product_occasions product_occasions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_occasions_read ON public.product_occasions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.products p
  WHERE (p.id = product_occasions.product_id))));


--
-- Name: product_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: product_reviews product_reviews_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_reviews_admin ON public.product_reviews TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: product_reviews product_reviews_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_reviews_read ON public.product_reviews FOR SELECT USING (((status = 'approved'::public.review_status) OR public.is_admin()));


--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: products products_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_admin ON public.products TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: products products_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_read ON public.products FOR SELECT USING (((status = 'active'::public.product_status) OR public.is_admin()));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated USING (((id = auth.uid()) OR public.is_admin()));


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: shipping_methods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shipping_methods ENABLE ROW LEVEL SECURITY;

--
-- Name: shipping_methods shipping_methods_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shipping_methods_admin ON public.shipping_methods TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: shipping_methods shipping_methods_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shipping_methods_read ON public.shipping_methods FOR SELECT USING ((is_active OR public.is_admin()));


--
-- Name: site_content; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

--
-- Name: site_content site_content_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_content_admin ON public.site_content TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: site_content site_content_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_content_read ON public.site_content FOR SELECT USING (true);


--
-- Name: sizes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sizes ENABLE ROW LEVEL SECURITY;

--
-- Name: sizes sizes_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sizes_admin ON public.sizes TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: sizes sizes_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sizes_read ON public.sizes FOR SELECT USING (true);


--
-- Name: style_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.style_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: style_lines style_lines_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY style_lines_admin ON public.style_lines TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: style_lines style_lines_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY style_lines_read ON public.style_lines FOR SELECT USING ((is_active OR public.is_admin()));


--
-- Name: variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.variants ENABLE ROW LEVEL SECURITY;

--
-- Name: variants variants_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY variants_admin ON public.variants TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: variants variants_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY variants_read ON public.variants FOR SELECT USING (((is_active AND (EXISTS ( SELECT 1
   FROM public.products p
  WHERE (p.id = variants.product_id)))) OR public.is_admin()));


--
-- Name: webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_events webhook_events_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webhook_events_admin_read ON public.webhook_events FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: wishlist_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;

--
-- Name: wishlist_items wishlist_items_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wishlist_items_own ON public.wishlist_items TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- PostgreSQL database dump complete
--


