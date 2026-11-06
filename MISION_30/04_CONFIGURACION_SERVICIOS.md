# M30 — 04. Configuración de servicios para QA (`yomgxdjgfjnrjaqiarvw`)

Lista exacta para después de la reconstrucción. **Nada se ha aplicado.** Ningún secreto se escribe aquí ni se pega en
conversaciones: los valores los introduce el propietario en el panel o desde archivos fuera del repositorio.

Origen del frontend de QA (decisión pendiente, `<ORIGEN_QA>`):
- Pruebas locales contra QA: `http://127.0.0.1:4174` (`pnpm preview:qa`) y `http://127.0.0.1:3100` (`pnpm dev:qa`).
- Vercel Preview: la URL del despliegue de QA (requiere autorización de despliegue).

## 1. Auth (Authentication → URL Configuration / Providers / Emails)
| Ajuste | Estado actual en QA | Valor requerido | Por qué |
|---|---|---|---|
| Site URL | `http://localhost:3000` | `<ORIGEN_QA>` principal | El registro no fija `emailRedirectTo`: los enlaces de confirmación usan la Site URL |
| Redirect URLs | ninguna | `<ORIGEN_QA>/cuenta`, `<ORIGEN_QA>/cuenta/restablecer`, `<ORIGEN_QA>/checkout/confirmacion`, `<ORIGEN_QA>/admin` (por cada origen) | `resetPasswordForEmail` → `/cuenta/restablecer`; OAuth → `/cuenta` y `/admin` |
| Proveedor email | activo | activo | — |
| Confirmación de correo | obligatoria | **Recomendado: obligatoria + SMTP propio** (prueba realista). Alternativa: desactivarla solo en QA | Sin SMTP propio el límite es **2 correos/hora** (`rate_limit_email_sent=2`) |
| SMTP propio | no | Proveedor sandbox (Mailtrap, Resend en modo prueba, …) | Registro y recuperación de contraseña en los recorridos 7 |
| Longitud mínima de contraseña | 6 | 8 | Coherente con el frontend |
| Google | desactivado | desactivado (no está en el alcance) | — |
| JWT | 3600 s, rotación de refresh activa | sin cambios | Probado en M28 (sesiones) |

### 1.5 Usuarios
- Tras el reset existen `superadmin@`, `admin@`, `cliente1@`, `cliente2@qa.jm.test` **sin contraseña utilizable**.
  Fijar una contraseña distinta por cuenta en Authentication → Users y guardarla en un gestor de contraseñas.
  - Administrador de prueba: `admin@qa.jm.test` (rol `admin`).
  - Cliente de prueba: `cliente1@qa.jm.test` (rol `customer`; tiene historial sembrado) y `cliente2@` para aislamiento.
- **Cuenta del propietario** (borrada por el reset): si se quiere, crearla en Authentication → Users
  (o registrarse en la tienda) y asignar el rol con una de estas dos vías:
  - Iniciar sesión como `superadmin@qa.jm.test` y ejecutar `select public.admin_set_user_role('<id>', 'admin')`.
  - SQL Editor del panel (rol `postgres`, permitido por `guard_profile_role`):
    `update public.profiles set role = 'admin' where id = '<id>'`.
- Nunca reutilizar la contraseña común retirada de M24–M25.

## 2. Storage
Los crea la migración M24 (verificado en el ensayo): no se configuran a mano.
| Bucket | Público | Límite | Tipos |
|---|---|---|---|
| `product-images` | sí | 5 MB | image/jpeg, image/png, image/webp, image/avif |
| `site-content` | sí | 5 MB | ídem |

Políticas sobre `storage.objects` (M24): `jm_public_images_read` (SELECT, public, ambos buckets);
`jm_admin_images_insert` / `_update` / `_delete` (authenticated **y** `public.is_admin()`).
Validación del acceso administrativo (recorridos 11 y 12): un admin sube una imagen a cada bucket; un cliente recibe error
al subir; un anónimo puede leer la URL pública.
Legado: el bucket `editorial_images` sobrevive al reset; retirarlo es opcional (03 §3 paso 9).

## 3. Edge Function `wompi-webhook`
| Ajuste | Valor |
|---|---|
| Código | El del repositorio (`supabase/functions/wompi-webhook/`), que usa `apply_payment_event` (M27). La versión 3 desplegada es anterior a M24 y escribe en el esquema heredado: **debe redesplegarse** |
| `verify_jwt` | `false` (versionado en `supabase/config.toml`, `[functions.wompi-webhook]`); comprobarlo en el panel tras desplegar |
| `APP_ENV` | `qa` (**falta hoy**; sin él la función actual no arranca) |
| Identificación del entorno | La función exige que `SUPABASE_URL` (inyectada por Supabase) esté en la lista de QA de `allowlist.generated.json`. Esa lista incluye `yomgxdjgfjnrjaqiarvw.supabase.co` desde M28 (**sin commit**: debe estar en el código que se despliega) |
| `WOMPI_EVENTS_SECRET` | Secreto de **eventos sandbox** (`test_events_…`); la función rechaza secretos de producción con `APP_ENV=qa` |
| Verificación de firmas | Checksum SHA-256 de las propiedades del evento + timestamp + secreto, comparación en tiempo constante; firma inválida → 401; evento duplicado → idempotente (`duplicate`); monto distinto al intento → rechazado |
| Despliegue | `supabase functions deploy wompi-webhook --remote=yomgxdjgfjnrjaqiarvw` |
| Secretos | Archivo fuera del repositorio `qa-edge.env` con `APP_ENV=qa` y `WOMPI_EVENTS_SECRET=…` → `supabase secrets set --env-file <ruta> --remote=yomgxdjgfjnrjaqiarvw` (evita dejar el secreto en el historial de la shell) |

## 4. Wompi (panel **sandbox**)
| Elemento | Dónde se usa | Forma |
|---|---|---|
| Ambiente | — | **Sandbox** únicamente |
| Llave pública | `VITE_WOMPI_PUBLIC_KEY` y `WOMPI_PUBLIC_KEY` (frontend y servidor QA) | `pub_test_…` |
| Secreto de integridad | `WOMPI_INTEGRITY_SECRET` (servidor QA: `/api/wompi/signature`) | `test_integrity_…` |
| Secreto de eventos | `WOMPI_EVENTS_SECRET` (Edge Function **y** servidor QA si se usa `/api/wompi/webhook`) | `test_events_…` |
| URL de eventos (HTTPS pública) | Panel sandbox → Eventos | `https://yomgxdjgfjnrjaqiarvw.supabase.co/functions/v1/wompi-webhook` (o el `/api/wompi/webhook` del despliegue QA de Vercel) |

La firma de integridad la genera el servidor de la tienda (`/api/wompi/signature`). Para pruebas locales contra QA,
`pnpm dev:qa` sirve esa ruta con las variables de servidor del archivo QA (plugin de desarrollo de M27).

## 5. Archivo QA local (11 variables, fuera del repositorio)
`VITE_APP_ENV=qa`, `VITE_SUPABASE_URL=https://yomgxdjgfjnrjaqiarvw.supabase.co`, `VITE_SUPABASE_ANON_KEY` (anon de QA),
`VITE_WOMPI_PUBLIC_KEY=pub_test_…`, `VITE_WOMPI_ENV=sandbox`, `APP_ENV=qa`, `SUPABASE_URL` (igual), `SUPABASE_SERVICE_ROLE_KEY`
(de QA), `WOMPI_PUBLIC_KEY=pub_test_…`, `WOMPI_INTEGRITY_SECRET=test_integrity_…`, `WOMPI_EVENTS_SECRET=test_events_…`.
Validación: `pnpm check:qa -- --file <ruta>` (lista de permitidos, `ref` de las llaves, sandbox, ninguna llave de
Production) y `pnpm build:qa -- --file <ruta>` (bundle sin secretos, solo el host QA).
