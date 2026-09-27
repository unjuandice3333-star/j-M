-- DB Migration: Auth Profiles, User Roles, and RLS Hardening
-- File: supabase/migrations/20260927030000_auth_profiles_rls.sql

-- 1. PROFILES TABLE CREATION
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'super_admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index on role for performance
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- 2. AUTOMATIC PROFILE CREATION TRIGGER ON AUTH.USERS REGISTRATION
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    'customer' -- FORCE customer role on self registration
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

-- 3. SECURE IS_ADMIN FUNCTION (SECURITY DEFINER to bypass RLS recursion)
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = p_user_id;

  RETURN (v_role IN ('admin', 'super_admin'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. ROW-LEVEL SECURITY (RLS) ON PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS profiles_read_own_or_admin ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

-- Users can read their own profile; Admins can read all profiles
CREATE POLICY profiles_read_policy ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin(auth.uid()));

-- Users can update their own non-sensitive fields (role changes blocked by trigger/CHECK)
CREATE POLICY profiles_update_own_policy ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid() 
    AND (role = (SELECT role FROM public.profiles WHERE id = auth.uid())) -- Cannot escalate role
  );

-- Admins can update any profile (including promoting roles)
CREATE POLICY profiles_admin_update_policy ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 5. PRODUCTS RLS HARDENING (Public Read, Admin Write)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_public_read ON public.products;
DROP POLICY IF EXISTS products_admin_write ON public.products;
DROP POLICY IF EXISTS products_admin_all ON public.products;
DROP POLICY IF EXISTS product_read_policy ON public.products;
DROP POLICY IF EXISTS product_write_policy ON public.products;

-- Everyone (anon + authenticated) can view non-deleted active products
CREATE POLICY products_public_read ON public.products
  FOR SELECT USING (deleted_at IS NULL);

-- Only admin users can insert, update, or delete products
CREATE POLICY products_admin_insert ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY products_admin_update ON public.products
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY products_admin_delete ON public.products
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- 6. CATEGORIES, BRANDS, STYLE_LINES RLS HARDENING
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.style_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.style_lines ENABLE ROW LEVEL SECURITY;

-- Public read policies
DROP POLICY IF EXISTS categories_public_read ON public.categories;
CREATE POLICY categories_public_read ON public.categories FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS brands_public_read ON public.brands;
CREATE POLICY brands_public_read ON public.brands FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS style_lines_public_read ON public.style_lines;
CREATE POLICY style_lines_public_read ON public.style_lines FOR SELECT USING (TRUE);

-- Admin write policies
DROP POLICY IF EXISTS categories_admin_write ON public.categories;
CREATE POLICY categories_admin_write ON public.categories FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS brands_admin_write ON public.brands;
CREATE POLICY brands_admin_write ON public.brands FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS style_lines_admin_write ON public.style_lines;
CREATE POLICY style_lines_admin_write ON public.style_lines FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 7. VARIANTS & INVENTORIES RLS HARDENING
ALTER TABLE public.variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventories ENABLE ROW LEVEL SECURITY;

-- Variants: Public read (needed for storefront stock & size display), Admin write
DROP POLICY IF EXISTS variants_public_read ON public.variants;
CREATE POLICY variants_public_read ON public.variants FOR SELECT USING (deleted_at IS NULL);

DROP POLICY IF EXISTS variants_admin_write ON public.variants;
CREATE POLICY variants_admin_write ON public.variants FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Inventories: Public read for stock availability checks, Admin write (customers cannot mutate stock)
DROP POLICY IF EXISTS inventories_public_read ON public.inventories;
CREATE POLICY inventories_public_read ON public.inventories FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS inventories_admin_write ON public.inventories;
CREATE POLICY inventories_admin_write ON public.inventories FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
