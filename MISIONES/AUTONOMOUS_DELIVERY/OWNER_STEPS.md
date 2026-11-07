# Pasos que requieren al propietario (Wompi Sandbox y Vercel Preview)

Nada de esto se pega en el chat ni en Git: los valores se cargan en los paneles indicados.

## A. Proyecto Supabase de QA/Preview (nunca Production)
1. Confirmar que existe un proyecto Supabase **exclusivo para QA/Preview** con la migración baseline aplicada (`supabase/migrations/20261106120000_baseline_ecommerce.sql`). El agente no ejecuta `supabase link`/`db push` (denegado por M25).
2. Tener a mano: URL del proyecto, `anon key` y `service_role key`.

## B. Wompi Sandbox
1. En el panel de Wompi (modo **Sandbox**) copiar: llave pública `pub_test_…`, secreto de integridad y secreto de eventos.
2. Configurar la URL de eventos del panel sandbox → `https://<preview>/api/wompi/webhook`.
3. Variables de servidor (Vercel, entorno **Preview**): `WOMPI_ENV=sandbox`, `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
4. Variables del navegador (Vercel, **Preview**): `VITE_APP_ENV=qa`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_WOMPI_PUBLIC_KEY`, `VITE_WOMPI_ENV=sandbox`. El host de Supabase debe estar en `config/environments.json` (`qa.supabase.allowed_hosts`) o la guarda de build lo rechaza.

## C. Vercel Preview
1. Autenticar Vercel (el agente no puede: `vercel` está denegado). La integración Git ya crea Previews por rama; la rama `mission/m26-dev-qa-environments` genera uno automáticamente al hacer push.
2. Comprobar que el entorno **Production** no tiene las variables anteriores sustituidas por las de QA y que no se promueve ningún Preview.

## D. Pruebas de aceptación con Wompi Sandbox real (cuando A–C estén listos)
`STORE_URL=<preview> SUPABASE_URL=… SUPABASE_ANON_KEY=… WOMPI_PUBLIC_KEY=pub_test_… CASE=approved node apps/web/e2e/wompi_sandbox.cjs` (casos: approved, declined, error). Tarjetas de prueba: documentación oficial de Wompi.
