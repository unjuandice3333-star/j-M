-- DB Migration: Phase 8 Analytics RPCs, Tracking Information & Commercial Metrics
-- File: supabase/migrations/20260927070000_phase8_analytics_tracking_metrics.sql

-- 1. TRACKING COLUMNS FOR ONLINE ORDERS
ALTER TABLE public.online_orders ADD COLUMN IF NOT EXISTS carrier VARCHAR(100) DEFAULT 'Coordinadora';
ALTER TABLE public.online_orders ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(150);
ALTER TABLE public.online_orders ADD COLUMN IF NOT EXISTS tracking_url TEXT;

-- Index on carrier and tracking number
CREATE INDEX IF NOT EXISTS idx_online_orders_tracking ON public.online_orders(carrier, tracking_number);

-- 2. SERVER-SIDE COMMERCIAL METRICS RPC FOR ADMIN DASHBOARD
CREATE OR REPLACE FUNCTION public.get_commercial_dashboard_metrics()
RETURNS JSONB AS $$
DECLARE
  v_today_sales NUMERIC(12, 2);
  v_week_sales NUMERIC(12, 2);
  v_month_sales NUMERIC(12, 2);
  v_total_orders INT;
  v_avg_ticket NUMERIC(12, 2);
  v_pending_orders INT;
  v_shipped_orders INT;
  v_delivered_orders INT;
  v_cancelled_orders INT;
  v_low_stock_count INT;
BEGIN
  -- Verificar autorización administrativa
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Operación denegada: Acceso restringido a administradores.';
  END IF;

  -- Ventas del día
  SELECT COALESCE(SUM(total), 0) INTO v_today_sales
  FROM public.online_orders
  WHERE status IN ('paid', 'processing', 'packed', 'shipped', 'delivered')
    AND created_at >= date_trunc('day', NOW());

  -- Ventas de la semana
  SELECT COALESCE(SUM(total), 0) INTO v_week_sales
  FROM public.online_orders
  WHERE status IN ('paid', 'processing', 'packed', 'shipped', 'delivered')
    AND created_at >= date_trunc('week', NOW());

  -- Ventas del mes
  SELECT COALESCE(SUM(total), 0) INTO v_month_sales
  FROM public.online_orders
  WHERE status IN ('paid', 'processing', 'packed', 'shipped', 'delivered')
    AND created_at >= date_trunc('month', NOW());

  -- Métricas generales
  SELECT COUNT(id), COALESCE(AVG(total), 0) INTO v_total_orders, v_avg_ticket
  FROM public.online_orders
  WHERE status IN ('paid', 'processing', 'packed', 'shipped', 'delivered');

  -- Conteos por estado
  SELECT COUNT(id) INTO v_pending_orders FROM public.online_orders WHERE status IN ('pending', 'payment_pending');
  SELECT COUNT(id) INTO v_shipped_orders FROM public.online_orders WHERE status = 'shipped';
  SELECT COUNT(id) INTO v_delivered_orders FROM public.online_orders WHERE status = 'delivered';
  SELECT COUNT(id) INTO v_cancelled_orders FROM public.online_orders WHERE status = 'cancelled';

  -- Conteo de stock bajo
  SELECT COUNT(id) INTO v_low_stock_count FROM public.inventories WHERE stock <= min_stock;

  RETURN jsonb_build_object(
    'today_sales', v_today_sales,
    'week_sales', v_week_sales,
    'month_sales', v_month_sales,
    'total_orders', v_total_orders,
    'avg_ticket', v_avg_ticket,
    'pending_orders', v_pending_orders,
    'shipped_orders', v_shipped_orders,
    'delivered_orders', v_delivered_orders,
    'cancelled_orders', v_cancelled_orders,
    'low_stock_count', v_low_stock_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
