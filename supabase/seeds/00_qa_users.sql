-- =============================================================================
-- SEED QA — USUARIOS DE PRUEBA (solo local, CI y QA. NUNCA Production)
-- =============================================================================
-- Dominio reservado de pruebas (.test, RFC 2606). Contraseña común de QA local:
--   QaLocal-2026!
-- No son credenciales reales ni personas reales.
-- =============================================================================

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
       extensions.crypt('QaLocal-2026!', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', u.full_name), now(), now()
FROM (VALUES
  ('00000000-0000-4000-8000-00000000a001'::uuid, 'superadmin@qa.jm.test', 'Super Admin QA'),
  ('00000000-0000-4000-8000-00000000a002'::uuid, 'admin@qa.jm.test',      'Admin QA'),
  ('00000000-0000-4000-8000-00000000a003'::uuid, 'cliente1@qa.jm.test',   'Cliente Uno QA'),
  ('00000000-0000-4000-8000-00000000a004'::uuid, 'cliente2@qa.jm.test',   'Cliente Dos QA')
) AS u(id, email, full_name)
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT u.id, u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
FROM auth.users u
WHERE u.email LIKE '%@qa.jm.test'
ON CONFLICT (id) DO NOTHING;

-- Roles administrativos (el seed corre como postgres; en la app se usa admin_set_user_role)
UPDATE public.profiles SET role = 'super_admin' WHERE id = '00000000-0000-4000-8000-00000000a001';
UPDATE public.profiles SET role = 'admin'       WHERE id = '00000000-0000-4000-8000-00000000a002';
UPDATE public.profiles SET phone = '3000000001' WHERE id = '00000000-0000-4000-8000-00000000a003';
UPDATE public.profiles SET phone = '3000000002' WHERE id = '00000000-0000-4000-8000-00000000a004';

INSERT INTO public.customer_addresses (id, user_id, recipient_name, phone, department, city, address_line, neighborhood, is_default)
VALUES
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000a003', 'Cliente Uno QA', '3000000001',
   'Cundinamarca', 'Bogotá D.C.', 'Calle de Prueba 1 # 2-3', 'Barrio QA', true),
  ('00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-00000000a004', 'Cliente Dos QA', '3000000002',
   'Antioquia', 'Medellín', 'Carrera de Prueba 4 # 5-6', 'Barrio QA', true)
ON CONFLICT (id) DO NOTHING;
