# MASTER STATUS — J&M Autonomous Delivery

Última actualización: 2026-11-10 (ejecución 52: método de envío visible en confirmación, «Mis pedidos» y admin; vitest 238/238, E2E sintético 10/10)
Rama autorizada: `mission/m26-dev-qa-environments`

## Continuidad
- Las ejecuciones 1–2 (M31.x) quedaron publicadas en GitHub (rama `mission/m26-dev-qa-environments`, `1cb1b4e`) y la ejecución 3 las recuperó desde un contenedor nuevo (arranque 05:36, distinto del 05:08): rama y HEAD idénticos al remoto, árbol limpio.
- Permisos: `.claude/settings.json` v2.1 permite solo `git push origin mission/m26-dev-qa-environments`. `main` protegida por el ruleset `PROTECT-MAIN-JM` (confirmado visualmente por el propietario).

## Estado verificado (ejecutado, no supuesto)
| Comprobación | Resultado |
|---|---|
| `pnpm build` | OK |
| ESLint (`apps packages scripts`, sin dist*) | 0 errores, 0 avisos |
| `pnpm test:unit` (vitest, jsdom) | **92/92** en 5 archivos: carrito 18, checkout 28, auth+rutas protegidas 23, pedidos/admin 17, utils 6 |
| `pnpm test:env` (node:test) | **142/142** (fallo de entorno corregido: ahora la CLI usa un envDir hermético) |
| `test-checkout-invariants.mjs` | 10/10 (nota: es un simulador; las pruebas reales son las de vitest) |
| BD local PostgreSQL 16 (`supabase/tests/run_local.sh`) | pgTAP 278/278, concurrencia 12/12, determinismo OK (ejecución 3) |
| **`pnpm test:e2e-synthetic`** (Chromium + Vite real + backend sintético) | **10/10 recorridos** |

Recorridos E2E: 1 catálogo/filtro · 2 producto, color, talla agotada · 3 carrito (límite de stock, persistencia, eliminar) · 4 cupón y envío · 5 checkout (validación, pedido, reserva de stock, carrito conservado sin pago) · 6 pedido pagado (webhook SINTÉTICO) · 7 sin stock al confirmar · 8 registro/logout/login/historial · 9 credenciales erróneas y rutas protegidas (cliente no entra al admin) · 10 admin: panel, ajuste de inventario, pedido pagado→procesando→enviado con guía.

Alcance honesto de los E2E: el backend (`apps/web/e2e/synthetic/backend.cjs`) es sintético y en memoria; emula Supabase con los contratos de la migración, NO prueba RLS, la BD real ni Wompi (eso lo cubren pgTAP y las pruebas de la ejecución 3). Wompi no está conectado: el pago no se simula como real; el paso «pagado» usa un endpoint sintético etiquetado como tal.

Defectos reales encontrados y corregidos en esta ejecución: (1) `applyCoupon` perdía el mensaje de error de red/servicio (doble traducción de `OrderError`) → ahora lo conserva; (2) etiquetas y botón del login casi invisibles (negro sobre tarjeta oscura) → contraste corregido; (3) `test:env` dependía de un `.env.local` ignorado → hermético.

## NO verificado
- Supabase local (`supabase start`): Docker sin demonio en este entorno (no hay `/var/run/docker.sock`).
- E2E contra Supabase REAL local (`e2e_checkout.cjs`, `e2e_admin.cjs`, …): requieren Docker. Los E2E sintéticos (arriba) los complementan, no los sustituyen.
- Wompi Sandbox real y Vercel Preview: faltan credenciales (ver abajo).

## Playwright (M36 → M36.1) — ver `PLAYWRIGHT_GUIDE.md` y `QA_DIAGNOSTICO_M36_1.md`
**Resultado real del propietario (Windows + Edge contra el Preview): 7/7 FALLARON.** No son 7 defectos independientes:
- **Autorización de Vercel (corregido en M36.1):** el bypass se enviaba como cabecera a todos los orígenes (rompió Google Fonts por CORS y exponía el secreto a terceros). Ahora el secreto solo lo usa Node, solo hacia el hostname exacto de `PLAYWRIGHT_BASE_URL`, y el navegador recibe únicamente la cookie de sesión de Vercel. Verificado con pruebas unitarias y un servidor local que imita un deployment protegido; **no probado contra Vercel real**.
- **Supabase QA (NO corregido: decisión del propietario):** 400 en `collections`, 404 en `shipping_methods` y `site_content` y catálogo vacío son consecuencia de que QA conserva el esquema heredado y no tiene el baseline M24 (inventario M29). **Los códigos exactos NO fueron capturados por mí** (la sesión no puede llegar a QA); esperados: `PGRST205` (tablas ausentes) y `PGRST200`/`42703` (`collections`). Quedan instrumentados para la próxima ejecución: prueba `[3] datos de Supabase` (código, mensaje, detalle y pista de cada respuesta ≥ 400) y `pnpm qa:diagnose` (solo lectura, llave anon).
- **Pruebas separadas por capa:** `[1] aplicación accesible`, `[2] bypass de Vercel`, `[3] datos de Supabase`, luego las 7 de smoke (originales, sin tocar).
- **Resultados verificados por mí (Linux, backend sintético):** Edge 157 y Chromium pasan; con el esquema heredado simulado fallan [3] y los 7 smoke con los códigos esperados (mismo patrón que el Preview real). **Preview aprobado: NO. Vercel Preview: NO PROBADO tras la corrección. Supabase QA: NO VALIDADO.**

## M36.2.1 — storage state de Vercel (ENOENT) · ver `PLAYWRIGHT_GUIDE.md`
Reproducido de forma determinista con un deployment protegido simulado (misma salida que el propietario: «cookie obtenida» y luego ENOENT). Causa: `global-setup` escribía en `config.rootDir` (= `testDir`) y la config leía otra carpeta; la carpeta tampoco estaba ignorada por git. Corregido con ruta única absoluta, carpeta recursiva, escritura atómica, validación estricta y verificación de acceso solo con cookie; saneado de trazas (la cookie aparecía en `trace.network`). **Validado:** 25 pruebas unitarias nuevas (155 en total), autoprueba del modo preview en Chromium y Edge 157 (Linux), Playwright local Edge/Chromium 9 pasan + 1 omitida. **NO validado: Windows+Edge (lo ejecutará el propietario), Vercel Preview real, Supabase QA.** Qué ejecutará el propietario: `pnpm test:pw:selftest` (debe dar `[selftest] OK`) y después `pnpm test:pw:preview`.

## Matriz de validación (qué se ejecutó y DÓNDE)
Fuente de «GitHub Actions»: jobs leídos en la API de Actions, ejecuciones nº 13 y nº 14 del workflow `ci` (commits `cef5fe42` y `725e3bde`): **todos los jobs en success, incluido `ci-gate`**, y el workflow `e2e-supabase` en success en `0cd1867`, `cef5fe42` y `725e3bde` (3 seguidas).

| Componente | Local (este contenedor) | GitHub Actions | Supabase local (Docker) | Supabase QA remoto | Wompi Sandbox | Vercel Preview |
|---|---|---|---|---|---|---|
| Build, ESLint, tsc | ✔ | ✔ (`quality`, run 13) | — | — | — | — |
| 131 pruebas unitarias (incl. bypass, diagnósticos y `qa:diagnose`) | ✔ 103/103 | ✔ (`quality`, run 13) | — | — | — | — |
| 142 pruebas de entorno + 23 de perfil QA | ✔ | ✔ (`quality`, run 13) | — | — | — | — |
| E2E sintético (backend en memoria, 10 recorridos) + Playwright (3 de salud + 7 smoke) | ✔ 10/10 (también bajo carga) | ✔ run 13 (antes ✘ en runs 11–12 por carreras de MI prueba, corregidas) | — | — | — | — |
| PostgreSQL 16 + pgTAP (`db-local`) | ✔ 278/278 | ✔ runs 10–13 | — | — | — | — |
| Supabase oficial local: migraciones, `db reset`, pgTAP 290, 39 comprobaciones HTTP (auth/RLS/RPC), pedido+pago con handlers reales de Wompi, determinismo (`db-supabase`) | — | ✔ runs 10–13 | ✔ | — | — | — |
| **E2E de navegador con Supabase local REAL** (`e2e_site_content`, `e2e_wishlist`, `e2e_cart_variant`, `e2e_session`, `e2e_commercial`) | — | ✔ **3 ejecuciones verdes seguidas** (commits `0cd1867`, `cef5fe4` y `725e3bd`); la primera (`0a82bee`) falló 2 de 5 por el widget REAL de Wompi cargándose desde internet → dominio bloqueado en el job | ✔ | — | — | — |
| Webhook Wompi (timestamp, firma, idempotencia, rechazos) | ✔ 16/16 | ✔ (`quality` paso 14) | ✔ flujo real en `db-supabase` | — | ✘ no probado | — |
| Límite de tasa de `/api/wompi/signature` | ✔ 4 pruebas con el handler real | ✔ (vitest en `quality`) | — | — | — | — |
| Supabase QA remoto (`yomgxdjgfjnrjaqiarvw`) | ✘ | ✘ | — | ✘ **NO VALIDADO** | — | — |
| Wompi Sandbox real | ✘ | ✘ | — | — | ✘ **NO VALIDADO** | — |
| Vercel Preview (`jym-web`) | ✘ | ✘ | — | — | — | ✘ **NO VALIDADO** |

Reglas de gobernanza del CI: `e2e-supabase` NO es parte de `ci-gate`; ya cumple el umbral de ≥3 ejecuciones verdes consecutivas (lleva 3): incorporarlo a `ci-gate` es una decisión pendiente del propietario (conviene observar alguna ejecución más, porque corre Docker y red). Un commit de esta misión (`0a82bee`, mensaje con coma en el ámbito) y otro (`0cd1867`, descripción de 107 caracteres) incumplen la convención; ya están publicados y su job `governance` falló solo en esas ejecuciones; un PR hacia `main` los marcará salvo título/squash conforme.

**Estado del CI sobre `db8a434` (run 20): todos los jobs ✔ salvo `security` ✘ (escaneo de secretos del HISTORIAL por dos cadenas de prueba con forma de JWT en `e142ab2`; ver `gitleaks-allowlist-e142ab2.patch` y EXECUTION_LOG). `ci-gate` ✘ hasta que el propietario decida.**

Flakiness conocida y mitigada (M35; confirmada en GitHub con `db8a434`): el job `quality` se colgó >12 min en 2 de 4 ejecuciones. Causa localizada: el build de Vite lanzado con `spawnSync` sin límite de tiempo en `scripts/env/deploy_build.test.mjs` (y en `qa_build.test.mjs`); reproducido en local bajo carga de CPU. Mitigación: límite de 90 s/150 s con un reintento solo ante timeout + `--test-timeout=300000`. Verificada localmente (23/23 bajo carga); en GitHub, la primera ejecución con la mitigación (run 14) terminó en success en ~3 min; **una sola ejecución no demuestra que el cuelgue esté resuelto**: vigilar `quality` en las próximas.

## Wompi Sandbox y Vercel Preview
Revisión de Wompi: `WOMPI_REVIEW.md` (13/13 pruebas del webhook hoy). Lista de comprobaciones del propietario: `OWNER_CHECKLIST.md`. Vercel `jym-web` (root `apps/web`): sin acceso a Vercel desde el agente (`vercel` denegado); configuración y guardas descritas en `MISION_26/08_T8_GUIA_QA.md` y `OWNER_STEPS.md`; el host de QA ya está en la lista de permitidos. No se desplegó nada.
Pasos exactos y variables (sin valores) en `OWNER_STEPS.md`. Bloqueado hasta que el propietario cargue credenciales QA/Sandbox.

## Ejecución 47 — Admin: colecciones y looks (antes simulado)
`/admin/colecciones` mostraba ocasiones de `mockData` con botones sin acción. Ahora es un CRUD real sobre `collections` + `collection_products` (crear, editar, activar, ordenar productos, eliminar), con validación (`services/collectionsAdminService.js`). Los looks activos alimentan «Completa el look» de la ficha de producto, que ya leía la BD. **Verificado:** 13 pruebas vitest nuevas (servicio + UI) y 7 aserciones pgTAP nuevas de RLS (anon/cliente no escriben; admin crea, hace upsert y elimina en cascada). **No verificado:** contra Supabase QA ni Preview (bloqueados).

## Ejecución 48 — Admin: configuración de envíos (antes redirigía al dashboard)
`/admin/configuracion` ahora gestiona `shipping_methods` (tarifa, umbral de envío gratis, tiempo de entrega, orden, activo; alta de métodos nuevos). La BD ya calculaba el envío con esa tabla (`private.shipping_cost`), así que el cambio se aplica a cotizaciones y pedidos nuevos sin desplegar. Reglas: `standard` no se puede desactivar (el checkout lo usa siempre); activo exige tarifa > 0 (igual que el CHECK); sin borrado (FK de pedidos). Eliminado código muerto sin referencias: `pages/Customers.jsx`, `Dashboard.jsx`, `Inventory.jsx` y sus `.module.css` (maquetas con cifras inventadas). **Verificado:** 13 pruebas vitest nuevas (servicio + UI), 6 aserciones pgTAP de RLS/CHECK (anon y cliente no escriben; admin edita y crea; activo con tarifa 0 → 23514). **No verificado:** contra Supabase QA ni Preview (bloqueados). Limitación conocida: los textos fijos «gratis desde $200.000» (cabecera, pie, InfoPage, ficha) no se actualizan solos; la página lo advierte.

## Ejecución 49 — Textos de envío dinámicos
Cabecera, pie, ficha de producto e InfoPage (`/envios`, FAQ) ya no tienen «$200.000»/«$15.000» fijos: leen el umbral y la tarifa del método `standard` de `shipping_methods` (`utils/shippingPolicy.js` + `hooks/useShippingPolicy.js`). Sin umbral o sin métodos cargados no se promete envío gratis. Corrige una incoherencia real: la página de envíos decía $15.000 aunque la tarifa en BD podía ser otra (el backend sintético usa 12.000). **Verificado:** 7 pruebas vitest nuevas; E2E sintético recorrido 4 ampliado (comprueba en Chromium el banner y la tarifa de `/envios`). **No verificado:** contra Supabase QA ni Preview (bloqueados).

## Ejecución 50 — Admin: cupones (dos defectos reales)
`AdminEditorialImagesPage` revisada: ya es real (site_content + Storage), sin cambios. `AdminDiscountsPage` tenía dos defectos: (1) al editar, las fechas se cargaban en UTC en un campo `datetime-local` (hora local), así que cada guardado sin cambios desplazaba inicio/fin −5 h en Colombia; (2) el formulario aceptaba 91–100 % y la BD lo rechazaba (`coupons_percent_range` 1–90) con un error genérico. Validación y acceso a datos movidos a `services/couponsAdminService.js` (espejo de los CHECK de la tabla); actualizar/activar sin filas afectadas ahora avisa en vez de fingir éxito. **Verificado:** 13 pruebas vitest nuevas (zona horaria America/Bogota forzada), ESLint, build, E2E sintético 10/10. pgTAP no re-ejecutado (sin cambios SQL). **No verificado:** contra Supabase QA ni Preview (bloqueados).

## Ejecución 51 — Checkout: método de envío (tres defectos reales)
El selector de método ya existía (la BD acepta `p_shipping_method` en `quote_cart`/`create_order`), pero con dos o más métodos activos fallaba: (1) `getTotals` reutilizaba la cotización del método anterior → el método recién elegido mostraba la tarifa del otro y el total no cuadraba; la estimación local usaba siempre `standard`; (2) una cotización lenta podía llegar después de otra más reciente y pisarla; (3) la clave de idempotencia no incluía el método → reintentar tras cambiar de método devolvía el pedido anterior con el envío viejo. Corregido: `getTotals(shippingMethod)` solo usa la cotización si coincide carrito Y método; secuencia de solicitudes en `refreshQuote`; clave = carrito+cupón+método; si el admin desactiva el método elegido se vuelve a `standard`. **Verificado:** 7 pruebas vitest nuevas (6 fallan sin el arreglo), suite 232/232, ESLint, build, E2E sintético 10/10. pgTAP no re-ejecutado (sin cambios SQL). **No verificado:** contra Supabase QA ni Preview (bloqueados).

## Ejecución 52 — Método de envío visible en el pedido
Confirmación (`get_order_public` ya devolvía `shipping.method`), «Mis pedidos» (la consulta no pedía `shipping_method_code`; ahora sí) y detalle del admin de pedidos muestran el nombre del método (`utils/shippingPolicy.js` → `shippingMethodLabel`). Nombre desde `shipping_methods`; el admin carga también los inactivos (pedidos antiguos conservan su nombre); en la tienda, si el método ya no está activo, nombre de respaldo o código. El backend sintético devolvía un `get_order_public` incompleto (sin `shipping`, nombre ni correo) → alineado con el contrato de la migración. **Verificado:** 6 pruebas vitest nuevas (5 fallan sin el cambio), suite 238/238, ESLint, build, E2E sintético 10/10 (recorridos 5 y 8 comprueban el método en Chromium). pgTAP no re-ejecutado (sin cambios SQL). **No verificado:** contra Supabase QA ni Preview (bloqueados).

## Pendiente (prioridad)
0. Siguiente trabajo de código sin credenciales: (a) ~~umbral de envío gratis dinámico~~ (hecho en ejecución 49); (b) ~~revisar `AdminEditorialImagesPage` y `AdminDiscountsPage`~~ (hecho en ejecución 50); ~~(c) checkout con selector de método de envío~~ (hecho en ejecución 51); ~~(d) método de envío en confirmación, «Mis pedidos» y admin~~ (hecho en ejecución 52); (e) siguiente: revisar `AdminCustomersPage` y `AdminDashboardPage` por cifras/acciones simuladas y la columna de método en la tabla de pedidos del admin con filtro.
1. Revisar la primera ejecución real del CI en GitHub (job `e2e-synthetic` y `quality` ampliado).
2. ~~Cobertura de UI Cart/Checkout y normalizeProduct~~ (hecho en ejecuciones 10–11); `adminService` (RPC admin_*) cubierto en la ejecución 12.
3. Job de CI que ejecute los E2E de navegador contra Supabase local real (`e2e_*.cjs`) tras `supabase start` en `db-supabase`.
4. ~~Aviso `MODULE_TYPELESS_PACKAGE_JSON`~~ (hecho en ejecución 13: `eslint.config.mjs`).
5. ~~UX: `alert()` nativo en `Login.jsx`~~ (hecho en ejecución 9: aviso en pantalla `role=status`).
6. Wompi Sandbox / Vercel Preview cuando existan credenciales.
