-- DB Migration: Authorized Super Admin Auto-Role for unjuandice3333@gmail.com
-- File: supabase/migrations/20260927080000_admin_authorized_email_role.sql

-- 1. UPDATE TRIGGER FUNCTION TO ASSIGN SUPER_ADMIN ROL TO UNJUANDICE3333@GMAIL.COM AT REGISTRATION
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT := 'customer';
BEGIN
  -- Verificar si el correo registrado coincide con el administrador único autorizado
  IF LOWER(NEW.email) = 'unjuandice3333@gmail.com' THEN
    v_role := 'super_admin';
  END IF;

  INSERT INTO public.profiles (id, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    v_role
  )
  ON CONFLICT (id) DO UPDATE SET
    role = CASE WHEN LOWER(NEW.email) = 'unjuandice3333@gmail.com' THEN 'super_admin' ELSE public.profiles.role END,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 2. PROMOTE EXISTING PROFILE IF AUTH USER ALREADY EXISTS FOR unjuandice3333@gmail.com
DO $$
DECLARE
  v_admin_user_id UUID;
BEGIN
  SELECT id INTO v_admin_user_id
  FROM auth.users
  WHERE LOWER(email) = 'unjuandice3333@gmail.com';

  IF v_admin_user_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, full_name, role)
    VALUES (v_admin_user_id, 'Super Admin J&M', 'super_admin')
    ON CONFLICT (id) DO UPDATE
    SET role = 'super_admin', updated_at = NOW();
  END IF;
END $$;
