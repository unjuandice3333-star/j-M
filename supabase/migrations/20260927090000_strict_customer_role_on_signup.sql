-- DB Migration: Remove email-based auto-promotion and strictly force 'customer' role on self-registration
-- File: supabase/migrations/20260927090000_strict_customer_role_on_signup.sql

-- 1. HARDEN HANDLE_NEW_USER_PROFILE() TO ALWAYS FORCE 'CUSTOMER' ROLE
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  -- Strict Hardening: Every public self-registration via Auth ALWAYS receives 'customer' role.
  -- Zero auto-promotion by email. Administrative roles must be assigned directly in database.
  INSERT INTO public.profiles (id, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    'customer'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 2. ENSURE UNJUANDICE3333@GMAIL.COM RETAINS SUPER_ADMIN IF ACCOUNT ALREADY EXISTS IN AUTH.USERS
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
