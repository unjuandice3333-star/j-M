-- =============================================================================
-- get_order_public: incluye el id del pedido (ejecución 58)
-- Quien tiene el enlace de seguimiento (número + token público) ya puede pagar o cancelar el pedido
-- (create_payment_attempt y cancel_my_order exigen id + token). Sin el id, el enlace abierto en otro navegador
-- no permitía reintentar el pago. El id no da acceso por sí solo: ambas RPC siguen exigiendo el token
-- (o la sesión del dueño). CREATE OR REPLACE conserva los GRANT existentes. Solo aditivo.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_order_public(p_order_number text, p_public_token uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE o public.online_orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.online_orders
   WHERE order_number = p_order_number AND public_token = p_public_token;
  IF NOT FOUND THEN
    RETURN NULL;   -- no revela si el número existe
  END IF;
  RETURN jsonb_build_object(
    'id', o.id, 'order_number', o.order_number, 'status', o.status,
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
