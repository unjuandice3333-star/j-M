-- Migration: 20261001010000_cleanup_legacy_has_permission_policies.sql
-- Description: Saneamiento de políticas RLS legacy que invocan public.has_permission()
--              y adición de la política moderna de administración para public.customers.

BEGIN;

-- 1. Eliminar políticas legacy dependientes de has_permission()
DROP POLICY IF EXISTS variant_write_policy ON public.variants;
DROP POLICY IF EXISTS inventory_write_policy ON public.inventories;
DROP POLICY IF EXISTS customer_write_policy ON public.customers;

-- 2. Asegurar política moderna de escritura administrativa para public.customers
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'customers' 
          AND policyname = 'customers_admin_write'
    ) THEN
        CREATE POLICY customers_admin_write ON public.customers
            FOR ALL
            TO authenticated
            USING (public.is_admin(auth.uid()))
            WITH CHECK (public.is_admin(auth.uid()));
    END IF;
END $$;

COMMIT;
