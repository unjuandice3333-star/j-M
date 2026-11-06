# 27 — AUDITORÍA DE INTEGRACIONES E INFRAESTRUCTURA · J&M FASHION STORE

**Repositorio:** `unjuandice3333-star/j-m` · `main` · `2661f2a`
**Restricción respetada:** no se accedió a consolas ni APIs de Supabase, Vercel, Wompi o GitHub con credenciales; no se desplegó nada. Todo lo remoto se describe **según el código y la documentación del repo** y se marca *no verificable* cuando corresponde.

---

## 1. Mapa de integraciones

```
Navegador (React SPA en Vercel)
 ├─ Supabase JS (anon key) ──► PostgREST / Auth / RPC  (Supabase Cloud)
 ├─ POST /api/wompi/signature ──► Vercel Function ──► Supabase (service role) 
 ├─ Wompi Checkout Widget (checkout.wompi.co/widget.js, public key)
 ├─ Google Fonts, imágenes Unsplash, SDK Google Identity (no usado)
 └─ GA4 / Meta Pixel (código de eventos; scripts NO cargados)

Wompi ──webhook──► ¿/api/wompi/webhook (Vercel)?  ¿/functions/v1/wompi-webhook (Supabase Edge)?
                    └─ ambos con service role → online_orders / payment_transactions / order_events
```

## 2. Clasificación

| # | Integración | Estado | Prioridad |
|---|---|---|---|
| I1 | Supabase (cliente, Auth, RPC) | IMPLEMENTADO, PERO NO VERIFICADO | P0 |
| I2 | Supabase CLI / entorno local reproducible | NO IMPLEMENTADO | P0 |
| I3 | Supabase QA vs Production (separación) | REQUIERE REVISIÓN | P0 |
| I4 | Vercel (build, rutas, funciones) | IMPLEMENTADO, PERO NO VERIFICADO | P1 |
| I5 | Wompi Widget + firma | IMPLEMENTADO, PERO NO VERIFICADO | P0 |
| I6 | Wompi Webhook (dos implementaciones) | REQUIERE REVISIÓN | P0 |
| I7 | GitHub (ramas, flujo, CI) | PARCIALMENTE IMPLEMENTADO | P0 |
| I8 | Variables de entorno | PARCIALMENTE IMPLEMENTADO | P1 |
| I9 | GA4 / Meta Pixel | SIMULADO O MOCK | P3 |
| I10 | Google OAuth | REQUIERE REVISIÓN | P2 |
| I11 | Email transaccional / transportadoras | NO IMPLEMENTADO | P2 |
| I12 | Supabase Storage (imágenes) | NO IMPLEMENTADO | P1 |

## 3. Hallazgos

### I1 — Supabase
- Cliente en `apps/web/src/config/supabase.js` (falla rápido si faltan variables ⇒ pantalla en blanco, ver doc 25 F25).
- Versiones: `@supabase/supabase-js ^2.43.2` (web), `2.39.0` vía esm.sh en la Edge Function.
- *No verificable:* proyecto, región, plan, backups, PITR, estado real del esquema.

### I2 — Entorno local
No existe `supabase/config.toml`, `seed.sql`, `docker-compose` ni script de arranque. **Hoy ningún agente ni desarrollador puede levantar una copia local fiel** con `supabase start`. Este es el bloqueante n.º 1 para una fábrica autónoma.

### I3 — QA vs Production
- Existe la rama `qa/supabase-preview`, idéntica a `main` (`2661f2a`). No hay archivo que indique a qué proyecto Supabase apunta cada entorno, ni separación de variables por entorno en el repo.
- `PRODUCTION_ACTIVATION_REPORT.md` y `GO_LIVE_REPORT.md` declaran "GO-LIVE APPROVED / PRODUCTION VERIFIED", **en contradicción con la evidencia** de esta auditoría (migraciones que no reconstruyen, funciones que fallan).
- **Requisito para la fábrica:** proyecto Supabase QA independiente con credenciales propias; Production fuera del alcance de agentes.

### I4 — Vercel
- Dos configuraciones: `vercel.json` (raíz: `buildCommand`, `outputDirectory`, rewrites) y `apps/web/vercel.json` (solo rewrites). Cuál aplica depende del *Root Directory* del proyecto Vercel — *no verificable*.
- `apps/web/scripts/postbuild.js` duplica `index.html` en carpetas por ruta ("triple-dist") además de `public/_redirects` (formato Netlify, ignorado por Vercel): parches acumulados por problemas de 404 (ver historial de commits del 25-26/09).
- Las funciones `api/wompi/*.js` dependen de que Vercel detecte `apps/web/api` como directorio de funciones (depende del *Root Directory*).
- No hay `engines`/versión de Node fijada; `packageManager: pnpm@11.0.8`.
- *No verificable:* proyectos, dominios (`jmfashionstore.co` aparece en `index.html`), preview deployments, variables configuradas.

### I5 — Wompi Widget y firma
- `services/wompi.js` carga `https://checkout.wompi.co/widget.js` y abre `WidgetCheckout` con firma de servidor; valida paridad referencia/monto/moneda (correcto).
- **Llave pública de respaldo hardcodeada** (`pub_test_Q5y15g9…`) si falta `VITE_WOMPI_PUBLIC_KEY`: en producción podría abrir el widget en modo sandbox de otro comercio sin error visible.
- `VITE_WOMPI_ENV` se lee pero no se usa.
- Sin evidencia de prueba en Sandbox (transacción aprobada, rechazada, PSE, Nequi).

### I6 — Webhook
Lógica idéntica en `apps/web/api/wompi/webhook.js` y `supabase/functions/wompi-webhook/index.ts`. Documentación contradictoria sobre cuál está registrado en Wompi. Ambos verificados solo con mocks (doc 28). La integración real con la BD falla al pasar a `paid` (doc 24, B8). Decidir **uno**.

### I7 — GitHub
- 88 commits, un único autor; mensajes tipo "fix: force…", "trigger: force Vercel production deployment build" ⇒ despliegue por *push* directo a `main`, sin PR ni revisión.
- Ramas: `main` (2026-10-13), `qa/supabase-preview` (= main), `Principal` (2026-09-27) y `Director` (2026-09-25) **desactualizadas** (−13.000 líneas vs main). `PRODUCTION_ACTIVATION_REPORT.md` afirma "Ramificación 'Principal' sincronizada": falso respecto a `main`.
- **Sin `.github/workflows`**: no hay CI (build, lint, pruebas, migraciones).
- `husky` configurado en `prepare` pero sin hooks en el repo.

### I8 — Variables de entorno (nombres, sin valores)

| Variable | Dónde se usa | En `.env.example` | Observación |
|---|---|---|---|
| `VITE_SUPABASE_URL` | web, `api/wompi/*` | Sí | Las funciones de servidor reutilizan una variable `VITE_*` |
| `VITE_SUPABASE_ANON_KEY` | web, `api/wompi/signature.js` (fallback) | Sí | Fallback indebido en servidor |
| `VITE_WOMPI_PUBLIC_KEY` | web, `api/wompi/signature.js` | Sí | Ejemplo con valor ficticio |
| `VITE_WOMPI_ENV` | `services/wompi.js` | **No** | Leída, sin efecto |
| `VITE_GA4_TRACKING_ID` | — | Sí | **No se usa** en el código |
| `VITE_META_PIXEL_ID` | — | Sí | **No se usa** en el código |
| `SUPABASE_URL` | Edge Function, `api/*` (alternativa) | **No** | Supabase la inyecta en Edge |
| `SUPABASE_SERVICE_ROLE_KEY` | `api/wompi/*`, Edge | Sí | Solo servidor |
| `WOMPI_INTEGRITY_SECRET` | `api/wompi/signature.js` | Sí | Solo servidor (Vercel) |
| `WOMPI_EVENTS_SECRET` | webhooks | Sí | Debe existir en Vercel **y/o** Supabase según el webhook elegido |
| `WOMPI_PUBLIC_KEY` | `api/wompi/signature.js` (alternativa) | **No** | |

No se encontraron credenciales reales en el árbol actual (solo marcadores de ejemplo). No se hizo análisis avanzado del historial.

### I9 — GA4/Meta
`services/analytics.js` llama `window.gtag`/`window.fbq` si existen; **ningún código carga esos scripts** ⇒ todos los eventos terminan en `console.debug('[GA4 Event Mock]…')`. El panel admin muestra "CONECTADO" de forma fija.

### I10 — Google OAuth
Implementado vía `supabase.auth.signInWithOAuth`. Requiere configuración del proveedor y URLs de redirección por entorno — *no verificable*. El SDK `accounts.google.com/gsi/client` en `index.html` es innecesario.

### I11–I12
Sin proveedor de email (Resend/SendGrid/Supabase SMTP), sin integración con transportadoras (Coordinadora/Servientrega se mencionan solo en texto). Sin uso de Supabase Storage: las imágenes son URLs externas (Unsplash) o Base64 en `localStorage`.

## 4. Procesos de despliegue (documentados en el repo)
1. `npx supabase db push` — **fallaría** en una BD limpia (doc 26).
2. `npx supabase functions deploy wompi-webhook --no-verify-jwt` + `supabase secrets set WOMPI_EVENTS_SECRET`.
3. Vercel: `pnpm --filter @jm/web build` (verificado: compila).
No existe proceso de *rollback*, ni de migración controlada QA→Production, ni smoke tests automatizados post-despliegue.

## 5. Recomendaciones
1. Crear `supabase/config.toml` + `seed.sql` y validar `supabase start` + `db reset` local (y en CI).
2. Proyecto **Supabase QA** dedicado + **Vercel Preview** ligado a QA; Production con aprobación humana obligatoria y credenciales que los agentes **no** posean.
3. Un único webhook; registrar en Wompi Sandbox la URL de QA.
4. CI en GitHub Actions: install → lint → typecheck → unit → db reset + pgTAP → build → E2E Playwright contra preview.
5. Protección de rama `main` (PR obligatorio, checks verdes).
6. Limpiar `.env.example` (alinear con tabla anterior) y separar variables de servidor sin prefijo `VITE_`.
7. Eliminar ramas `Principal`/`Director` o documentarlas como archivadas.

## 6. Criterios de terminado
- Entorno local y QA levantables con un comando y reproducibles.
- Pago Sandbox aprobado/rechazado/expirado verificado de punta a punta con evidencia (IDs de transacción, estados en BD).
- CI obligatoria en `main`; despliegue a Production solo por aprobación humana.
- Inventario de variables por entorno documentado y validado al arranque.
