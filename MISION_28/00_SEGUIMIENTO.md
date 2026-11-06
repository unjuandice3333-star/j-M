# M28 — Finalización funcional y preparación comercial: seguimiento y aceptación

**Base:** código de M27 sin commit sobre `e42ecae` (incluye R1.1). Pruebas en el stack Supabase LOCAL (esquema M24) y
Chromium real. Sin migraciones nuevas: `site_content`, el bucket `site-content` y `wishlist_items` ya existían en M24
con sus políticas. Sin push, PR, merge, despliegue ni operaciones remotas. Sin acceso a QA, Production ni Wompi.

> **La tienda NO se declara lista para vender.** Falta ejecutar y verificar la compra en Wompi Sandbox real y el entorno
> QA remoto (§5 y §6), que dependen de credenciales y autorizaciones del propietario.

## 1. Funcionalidades completadas
| # | Funcionalidad | Implementación |
|---|---|---|
| 1 | Imágenes de portada persistentes (FAIL de M27) | `siteContentService` → tabla `site_content` (lectura pública, escritura admin por RLS) + bucket `site-content` (subida solo admin). Biblioteca real del bucket (antes: 16 imágenes con nombres y fechas inventados). Subir, elegir de la biblioteca, URL https, texto alternativo, restaurar. El navegador ya no guarda la portada (store v15 descarta la copia antigua de `localStorage`) |
| 2 | Lista de deseos en la cuenta | `wishlistService` → `wishlist_items` (PK usuario+producto ⇒ sin duplicados; RLS solo propietario). Sin sesión se guarda en el navegador; al iniciar sesión se fusiona en la BD; se resincroniza al volver a la pestaña; al cerrar sesión se borra la copia local. Errores revertidos en la interfaz (sin éxito falso) |
| 3 | Cambio de talla/color en el carrito | Selectores con las variantes reales; atómico (si falla, el carrito no cambia); fusiona líneas iguales solo si el stock lo permite; precio de la variante y cotización `quote_cart` de la BD |
| 4 | Sesiones | Rutas protegidas verificadas; renovación automática del token; sesión vencida detectada. **Nuevo:** si la sesión vence durante el checkout no se crea un pedido «huérfano»: aviso, volver a entrar (regresa al checkout) o continuar como invitado; borrador del envío en `sessionStorage` |
| 5 | Wompi Sandbox (preparado) | `e2e/wompi_sandbox.cjs`: compra real en sandbox de punta a punta (§5). Bloqueado por credenciales y red |
| 6 | QA (preparado) | Host del proyecto QA existente `yomgxdjgfjnrjaqiarvw.supabase.co` añadido a la lista de permitidos (+ copias regeneradas). Pendientes remotos en §6 |

## 2. Errores encontrados y corregidos
| Error | Corrección |
|---|---|
| Portada solo en `localStorage` del admin (data: URL), invisible para clientes | `site_content` + Storage |
| Biblioteca multimedia con archivos y fechas inventados | Listado real del bucket |
| Lista de deseos solo local, sin cuenta | `wishlist_items` + sincronización |
| `changeVariant` eliminaba la línea **antes** de validar: si fallaba, el artículo se perdía; no validaba la fusión con otra línea | Reescrito atómico |
| **Sesión vencida durante el checkout ⇒ pedido creado como invitado sin aviso** (no aparecía en «Mis pedidos»). Reproducido: JM-001008 | Verificación de sesión antes de `create_order`; el pedido huérfano de la prueba se canceló (stock liberado) |
| Prueba `r1_1_deploy_context` asumía la lista QA vacía | Usa un host ficticio adicional |
| Escape innecesario en `e2e_quality.cjs` (error de lint) | Corregido |

## 3. Pruebas en navegador (Chromium real, stack local) — todas con aserciones
| Script | Resultado | Cubre |
|---|---|---|
| `e2e_site_content.cjs` | **27/27 PASS** | subida, recarga, cierre de sesión, otro navegador (móvil, anónimo), alt desde BD, cliente 403 / anónimo 401 / Storage rechazado, biblioteca, restaurar, URL no https rechazada |
| `e2e_wishlist.cjs` | **19/19 PASS** | fusión al iniciar sesión, 2 dispositivos, sin duplicados (409), otro cliente no lee/escribe/borra, logout limpia |
| `e2e_cart_variant.cjs` | **17/17 PASS** | sin stock → rechazo sin cambios, color, talla agotada deshabilitada, precio de variante y `quote_cart`, fusión, fusión excedida |
| `e2e_session.cjs` | **21/21 PASS** | rutas protegidas, renovación, sesión revocada, expiración en checkout, reingreso y pedido asociado |
| `e2e_commercial.cjs` | **32/32 PASS** | ver §7 (prueba comercial integral) |
| `e2e_quality.cjs` (M27, regresión) | PASS | recorrido 2, escritorio/móvil sin errores ni desbordes, admin móvil |
| Comprobación móvil 360 px | 0 px de desborde | `/carrito`, `/cuenta/favoritos`, `/checkout`, `/admin/imagenes` y su modal |

## 4. Pruebas de integración
| Suite | Resultado |
|---|---|
| pgTAP (funcionales, RPC, RLS) sobre Supabase local | 290/290 |
| HTTP contra PostgREST/GoTrue/Storage locales | 44/44 |
| Pedido y pago (create_order → firma → webhook firmado) contra la BD local | 13/13 |
| Determinismo de seeds | 7/7 |
| Webhook Vercel · Edge Function (seguridad) · configuración Edge | 13/13 · 10/10 · 30/30 |
| Guardas de entorno · perfil QA | 141/141 · 23/23 |

## 5. Wompi Sandbox — variables y pasos
**Estado: BLOCKED.** Desde este entorno no hay red hacia `sandbox.wompi.co`/`checkout.wompi.co` ni credenciales sandbox.
El flujo está preparado y probado con eventos firmados localmente por el **mismo** endpoint que usará Wompi.

Variables (todas **sandbox**; nunca `pub_prod_`/`prod_`):
| Variable | Dónde | Forma | Origen (panel sandbox de Wompi) |
|---|---|---|---|
| `VITE_WOMPI_PUBLIC_KEY` | navegador (`apps/web/.env.local` o entorno QA) | `pub_test_…` | Llave pública |
| `VITE_WOMPI_ENV` | navegador | `sandbox` | — |
| `WOMPI_PUBLIC_KEY` | servidor (proceso de `vite`/Vercel) | `pub_test_…` (la misma) | Llave pública |
| `WOMPI_INTEGRITY_SECRET` | servidor | `test_integrity_…` | Secretos → Integridad |
| `WOMPI_EVENTS_SECRET` | servidor **y** Edge Function | `test_events_…` | Secretos → Eventos |
| `APP_ENV`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | servidor | `local`/`qa` y la BD de la tienda | Supabase |

Pasos:
1. Local: `VITE_WOMPI_PUBLIC_KEY=pub_test_… pnpm env:local` (acepta solo `pub_test_`); exportar las variables de
   servidor en la terminal y arrancar `pnpm --filter @jm/web dev`.
2. **Webhook:** Wompi solo llama a una URL HTTPS pública. Configurar la «URL de eventos» del panel sandbox hacia el
   endpoint de QA (`/api/wompi/webhook` de Vercel o la Edge Function `wompi-webhook`) o hacia un túnel HTTPS al equipo local.
3. Ejecutar `CASE=approved`, `CASE=declined` y `CASE=nequi` con `node apps/web/e2e/wompi_sandbox.cjs` (variables
   `STORE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `WOMPI_PUBLIC_KEY`). Verifica: llave reconocida, firma de integridad
   aceptada por Wompi, pedido pendiente mientras la transacción está PENDING, webhook aplicado y estado final.
4. Comprobación manual del widget en navegador con tarjeta de prueba (aprobada `4242 4242 4242 4242`; rechazada
   `4111 1111 1111 1111`; Nequi `3991111111`), según los datos de prueba de Wompi.

## 6. QA remoto (`yomgxdjgfjnrjaqiarvw`) — configuración pendiente
Hecho en local: host en `config/environments.json` (`qa.supabase.allowed_hosts`) y copias regeneradas.
Pendiente del propietario (operaciones remotas que requieren autorización):
1. Archivo QA **fuera del repositorio** con las 11 variables de `config/env/qa.env.example` (QA + Wompi sandbox) →
   `pnpm check:qa -- --file <qa.env>` y `pnpm build:qa -- --file <qa.env>`.
2. Base de datos QA: inventario previo (Fase A de `MISION_26/06_T6_QA.md`) y aplicar la migración M24 **sin `db reset`**
   y sin `--linked`. **Requiere su autorización**: es una migración remota. M28 no añade migraciones.
3. Storage QA: comprobar que existen los buckets `product-images` y `site-content` (los crea la migración M24).
4. Auth QA: Site URL y Redirect URLs del frontend QA, incluidas `/cuenta`, `/cuenta/restablecer` y `/checkout/confirmacion`.
5. Usuarios QA: contraseñas fijadas en el panel; rol admin del administrador.
6. Edge Function `wompi-webhook` con `WOMPI_EVENTS_SECRET` sandbox y `APP_ENV=qa`, `verify_jwt = false`.
7. Entorno Vercel de QA (Preview) con las 11 variables y webhook sandbox apuntando a él. **Despliegue: requiere su autorización.**

## 7. Estado por funcionalidad
| Funcionalidad | Estado |
|---|---|
| Portada persistente (recarga, logout, otro navegador, permisos) | PASS |
| Lista de deseos persistente, multi-dispositivo, sin duplicados, solo propietario | PASS |
| Cambio de variante en el carrito (stock, precio, cantidades) | PASS |
| Rutas protegidas · renovación de sesión · sesión vencida · expiración en checkout | PASS |
| Cliente nuevo: registro + compra con cupón + pago aprobado | PASS (eventos firmados localmente) |
| Cliente recurrente: historial + compra sin cupón | PASS |
| Pago rechazado → pendiente con reintento · pago pendiente · aprobado tras reintento | PASS (eventos firmados localmente) |
| Admin: crear producto (imagen, tallas, stock) | PASS |
| Admin: modificar inventario con motivo | PASS |
| Admin: gestionar pedidos (preparación, envío con guía, entregado) visible para el cliente | PASS |
| Admin: cambiar contenido de portada visible para visitantes | PASS |
| Compra real en Wompi Sandbox (widget, cobro sandbox, webhook enviado por Wompi) | **BLOCKED** (credenciales y red) |
| Tienda funcionando contra QA remoto | **BLOCKED** (configuración remota y autorización) |
| Galería móvil de la ficha (mejora visual pendiente de M27) | NOT TESTED en M28 (sin cambios) |

## 8. Validación automatizada
- CI completa (`scripts/ci/run_all.sh`, perfil full): **18/18 PASS** — árbol de trabajo sucio: no es evidencia de un commit.
- Autoprueba de la compuerta (`gate_selftest.sh`): **90/90**.
- Lint 0 errores · typecheck OK · build OK · política de migraciones OK (sin migraciones nuevas) · gitleaks OK.
- Incidencias del entorno durante la validación (no del código): el CLI de Supabase dejó llaves de demostración locales en
  `supabase/.temp/start-secrets/` (ignorado por git) y gitleaks las detectó; se borró el temporal. El directorio temporal del entorno perdió
  el permiso de lectura para `postgres` (etapa pgTAP); se restauró. Deno no estaba en el PATH (etapa Edge BLOCKED); se
  ejecutó con `DENO_BIN`.

## 9. Archivos de M28
Nuevos: `apps/web/src/services/siteContentService.js`, `apps/web/src/services/wishlistService.js`,
`apps/web/e2e/{e2e_site_content,e2e_wishlist,e2e_cart_variant,e2e_session,e2e_commercial,wompi_sandbox}.cjs`,
`MISION_28/00_SEGUIMIENTO.md`.
Modificados: `apps/web/src/store/eCommerceStore.js`, `apps/web/src/pages/admin/AdminEditorialImagesPage.jsx`,
`apps/web/src/pages/{HomePage,CartPage,CheckoutPage,AccountPage,WishlistPage}.jsx`, `apps/web/src/layouts/PublicLayout.jsx`,
`apps/web/src/components/Product/ProductCard.jsx`, `config/environments.json`, `apps/web/src/config/allowlist.generated.json`,
`supabase/functions/wompi-webhook/allowlist.generated.json`, `scripts/env/r1_1_deploy_context.test.mjs`,
`apps/web/scripts/test-edge-config.ts`, `apps/web/e2e/{README.md,e2e_quality.cjs}`.
