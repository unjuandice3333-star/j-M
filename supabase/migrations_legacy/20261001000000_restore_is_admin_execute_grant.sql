-- Migration: Restablecer permiso EXECUTE sobre public.is_admin para el rol authenticated
-- Archivo: supabase/migrations/20261001000000_restore_is_admin_execute_grant.sql
--
-- Contexto:
-- En 20260929000000_cleanup_pos_architecture.sql se ejecutó REVOKE ALL ON ALL FUNCTIONS,
-- lo que revocó el permiso de ejecución de public.is_admin a usuarios autenticados.
-- Esto provocaba el error 42501 al evaluar las políticas RLS dependientes (ej. profiles_read_policy).

DO $$
BEGIN
  -- 1. Verificar de forma segura e idempotente que la función public.is_admin existe
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'is_admin'
  ) THEN
    -- 2. Conceder únicamente el privilegio EXECUTE al rol authenticated
    GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;

    RAISE NOTICE 'Permiso EXECUTE sobre public.is_admin(UUID) concedido a authenticated.';
  ELSE
    RAISE NOTICE 'La función public.is_admin no existe en schema public; no se aplicaron cambios.';
  END IF;
END $$;
