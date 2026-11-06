-- ============================================================================
-- MIGRACIÓN DE LIMPIEZA Y DEPURACIÓN ARQUITECTURAL E-COMMERCE J&M FASHION STORE
-- Archivo: supabase/migrations/20260929000000_cleanup_pos_architecture.sql
-- Descripción: Eliminación segura de componentes POS/físicos obsoletos,
--              fortalecimiento de atomicidad de inventario e-commerce,
--              y consolidación de políticas de RLS e idoneidad de seguridad.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. ELIMINACIÓN SEGURA DE VISTAS Y DISPARADORES ASOCIADOS A POS
-- ----------------------------------------------------------------------------

DROP VIEW IF EXISTS public.pos_daily_sales_summary;
DROP VIEW IF EXISTS public.pos_employee_performance;
DROP VIEW IF EXISTS public.pos_shift_reconciliation;




-- ----------------------------------------------------------------------------
-- 2. ELIMINACIÓN DE TABLAS POS (ORDEN DE DEPENDENCIAS REVERSAS SEGURO)
-- ----------------------------------------------------------------------------

DROP TABLE IF EXISTS public.transfer_items;
DROP TABLE IF EXISTS public.transfers;
DROP TABLE IF EXISTS public.sale_items;
DROP TABLE IF EXISTS public.sales;
DROP TABLE IF EXISTS public.shifts;
DROP TABLE IF EXISTS public.employees;

-- ----------------------------------------------------------------------------
-- 3. ELIMINACIÓN DE FUNCIONES DE NEGOCIO POS
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.current_employee_branch();
DROP FUNCTION IF EXISTS public.current_employee_role();
DROP FUNCTION IF EXISTS public.register_pos_sale(UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS public.open_shift(UUID, NUMERIC);
DROP FUNCTION IF EXISTS public.close_shift(UUID, NUMERIC);
DROP FUNCTION IF EXISTS public.process_transfer(UUID);
DROP FUNCTION IF EXISTS public.create_online_order_validated(UUID, JSONB, VARCHAR, NUMERIC, NUMERIC, NUMERIC, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, UUID);

-- ----------------------------------------------------------------------------
-- 4. DESACOPLAMIENTO DE LA AUDITORÍA DE INVENTARIO Y EMPLEADOS POS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.process_audit_log_hardened()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID;
    v_branch_id UUID := 'b1000000-0000-0000-0000-000000000001'::UUID; -- Bodega Principal E-Commerce
BEGIN
    v_actor_id := auth.uid();
    
    INSERT INTO public.audit_logs (
        id,
        table_name,
        record_id,
        action,
        old_data,
        new_data,
        performed_by,
        branch_id,
        created_at
    ) VALUES (
        gen_random_uuid(),
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        v_actor_id,
        v_branch_id,
        NOW()
    );
    
    RETURN NULL;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. RECONSTRUCCIÓN ATÓMICA Y DEPURADA DE PROCESS_ONLINE_ORDER_INVENTORY()
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.process_online_order_inventory(UUID);

CREATE OR REPLACE FUNCTION public.process_online_order_inventory(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_item RECORD;
    v_inv RECORD;
    v_stock_before INT;
    v_stock_after INT;
    v_already_deducted BOOLEAN;
BEGIN
    -- 1. Verificar idempotencia en order_events
    SELECT EXISTS (
        SELECT 1 FROM public.order_events
        WHERE order_id = p_order_id AND event_type = 'INVENTORY_DEDUCTED'
    ) INTO v_already_deducted;

    IF v_already_deducted THEN
        RETURN TRUE;
    END IF;

    -- 2. Obtener y bloquear la orden
    SELECT * INTO v_order
    FROM public.online_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Orden % no encontrada.', p_order_id;
    END IF;

    -- 3. Recorrer ítems de la orden
    FOR v_item IN 
        SELECT variant_id, quantity 
        FROM public.online_order_items 
        WHERE order_id = p_order_id 
    LOOP
        -- Bloquear la fila de inventario para la variante y bodega
        SELECT id, stock INTO v_inv
        FROM public.inventories
        WHERE variant_id = v_item.variant_id 
          AND branch_id = v_order.branch_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Registro de inventario inexistente para variante % en bodega %', 
                v_item.variant_id, v_order.branch_id;
        END IF;

        IF v_inv.stock < v_item.quantity THEN
            RAISE EXCEPTION 'Stock insuficiente para variante %. Requerido: %, Disponible: %', 
                v_item.variant_id, v_item.quantity, v_inv.stock;
        END IF;

        v_stock_before := v_inv.stock;
        v_stock_after := v_inv.stock - v_item.quantity;

        -- Descontar inventario
        UPDATE public.inventories
        SET stock = v_stock_after,
            updated_at = NOW()
        WHERE id = v_inv.id;

        -- Registrar movimiento de inventario
        INSERT INTO public.inventory_movements (
            id,
            inventory_id,
            variant_id,
            branch_id,
            movement_type,
            quantity_change,
            quantity_before,
            quantity_after,
            reference_id,
            notes,
            created_at
        ) VALUES (
            gen_random_uuid(),
            v_inv.id,
            v_item.variant_id,
            v_order.branch_id,
            'ONLINE_SALE',
            -v_item.quantity,
            v_stock_before,
            v_stock_after,
            p_order_id,
            'Deducción automática por pago de orden e-commerce',
            NOW()
        );
    END LOOP;

    -- 4. Registrar evento de deducción completada exitosamente
    INSERT INTO public.order_events (
        id, order_id, event_type, description, metadata, created_at
    ) VALUES (
        gen_random_uuid(),
        p_order_id,
        'INVENTORY_DEDUCTED',
        'Inventario descontado exitosamente en bodega',
        jsonb_build_object('branch_id', v_order.branch_id),
        NOW()
    );

    RETURN TRUE;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. RECONSTRUCCIÓN ATÓMICA DE RESTORE_ONLINE_ORDER_INVENTORY()
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.restore_online_order_inventory(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_item RECORD;
    v_inv RECORD;
    v_stock_before INT;
    v_stock_after INT;
    v_is_deducted BOOLEAN;
    v_already_restored BOOLEAN;
BEGIN
    -- 1. Verificar si fue descontado previamente
    SELECT EXISTS (
        SELECT 1 FROM public.order_events
        WHERE order_id = p_order_id AND event_type = 'INVENTORY_DEDUCTED'
    ) INTO v_is_deducted;

    IF NOT v_is_deducted THEN
        RETURN FALSE;
    END IF;

    -- 2. Verificar si ya fue restaurado
    SELECT EXISTS (
        SELECT 1 FROM public.order_events
        WHERE order_id = p_order_id AND event_type = 'INVENTORY_RESTORED'
    ) INTO v_already_restored;

    IF v_already_restored THEN
        RETURN TRUE;
    END IF;

    -- 3. Obtener orden
    SELECT * INTO v_order
    FROM public.online_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Orden % no encontrada para restauración.', p_order_id;
    END IF;

    -- 4. Restaurar inventarios con verificación estricta de existencia
    FOR v_item IN 
        SELECT variant_id, quantity 
        FROM public.online_order_items 
        WHERE order_id = p_order_id 
    LOOP
        SELECT id, stock INTO v_inv
        FROM public.inventories
        WHERE variant_id = v_item.variant_id 
          AND branch_id = v_order.branch_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'No existe registro de inventario para variante % en bodega % durante la restauración', 
                v_item.variant_id, v_order.branch_id;
        END IF;

        v_stock_before := v_inv.stock;
        v_stock_after := v_inv.stock + v_item.quantity;

        UPDATE public.inventories
        SET stock = v_stock_after,
            updated_at = NOW()
        WHERE id = v_inv.id;

        INSERT INTO public.inventory_movements (
            id,
            inventory_id,
            variant_id,
            branch_id,
            movement_type,
            quantity_change,
            quantity_before,
            quantity_after,
            reference_id,
            notes,
            created_at
        ) VALUES (
            gen_random_uuid(),
            v_inv.id,
            v_item.variant_id,
            v_order.branch_id,
            'RETURN_CANCEL',
            v_item.quantity,
            v_stock_before,
            v_stock_after,
            p_order_id,
            'Restauración de inventario por cancelación/reembolso de orden',
            NOW()
        );
    END LOOP;

    -- 5. Registrar evento de restauración completada
    INSERT INTO public.order_events (
        id, order_id, event_type, description, metadata, created_at
    ) VALUES (
        gen_random_uuid(),
        p_order_id,
        'INVENTORY_RESTORED',
        'Inventario restaurado exitosamente',
        jsonb_build_object('branch_id', v_order.branch_id),
        NOW()
    );

    RETURN TRUE;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. FORTALECIMIENTO DE POLÍTICAS DE SEGURIDAD Y RLS
-- ----------------------------------------------------------------------------

-- Habilitar RLS en tablas críticas si no lo estuvieran
ALTER TABLE public.inventories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- Limpieza de políticas antiguas de inventarios y bodega
DROP POLICY IF EXISTS inventory_read_policy ON public.inventories;
DROP POLICY IF EXISTS inventory_public_read ON public.inventories;
DROP POLICY IF EXISTS inventory_admin_all ON public.inventories;

DROP POLICY IF EXISTS branch_read_policy ON public.branches;
DROP POLICY IF EXISTS branch_public_read ON public.branches;
DROP POLICY IF EXISTS branch_admin_all ON public.branches;

-- Políticas estrictas para INVENTORIES: solo personal administrativo/autenticado con rol admin
CREATE POLICY inventory_admin_select ON public.inventories
    FOR SELECT
    TO authenticated
    USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    );

CREATE POLICY inventory_admin_write ON public.inventories
    FOR ALL
    TO authenticated
    USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    );

-- Políticas estrictas para BRANCHES (Bodegas): lectura solo para usuarios autenticados
CREATE POLICY branch_authenticated_select ON public.branches
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY branch_admin_write ON public.branches
    FOR ALL
    TO authenticated
    USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    );

-- ----------------------------------------------------------------------------
-- 8. GESTIÓN DE PERMISOS DE EJECUCIÓN (RPC)
-- ----------------------------------------------------------------------------

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Otorgar ejecución solo a RPCs legítimas para el storefront público
GRANT EXECUTE ON FUNCTION public.get_available_stock(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user_profile() TO authenticated, anon;

-- Otorgar ejecución a backend de servicios y admin
GRANT EXECUTE ON FUNCTION public.process_online_order_inventory(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_online_order_inventory(UUID) TO service_role;

COMMIT;
