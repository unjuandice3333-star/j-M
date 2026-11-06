# M29 — Preparación y validación del ecommerce en Supabase QA (`yomgxdjgfjnrjaqiarvw`)

> **M30.2:** las herramientas operativas citadas aquí (`inventory.mjs`, `compare_inventory.mjs`, `backup_logical_api.mjs`, `backup_qa_owner.sh`, `restore_dump_local.sh`) no se versionan en el repositorio (regla 6 de `20_migrations_policy`: ningún ejecutable versionado puede contener operaciones remotas de Supabase). Se entregan aparte como kit `jm-qa-tools` con sus huellas SHA-256; ver `MISION_30_2/00_DECISION_Y_VERSIONADO.md`.

**Autorización de esta misión:** inspección, lectura y preparación local. **Sin** migraciones remotas, cambios en QA,
Production o Vercel, secretos remotos, push/PR/merge/deploy ni cambios de datos.

**Estado:** la Fase 1 (inventario de QA) está **BLOCKED**: desde esta sesión la política de red rechaza (HTTP 403 del
proxy) `yomgxdjgfjnrjaqiarvw.supabase.co`, `db.yomgxdjgfjnrjaqiarvw.supabase.co`, el pooler y `api.supabase.com`, y no
hay ninguna credencial de QA. No se ha leído ni modificado nada de QA. Todo lo demás quedó preparado para que el
inventario se ejecute en minutos y su resultado se compare automáticamente con M24.

## 1. Herramientas preparadas (locales, sin conexión remota hasta que se autorice)
| Archivo | Qué hace |
|---|---|
| `jm-qa-tools/inventory.mjs` | Inventario **de solo lectura**: versión de PG, esquemas, historial de migraciones, relaciones y columnas, funciones (firma, `SECURITY DEFINER`, hash del cuerpo, permisos anon/authenticated), políticas RLS (hash de la definición), enums, triggers, recuento de filas por tabla, buckets y objetos, usuarios (solo recuentos), roles, cuentas seed (sin contraseña ni correo completo). Por API además: configuración de Auth (lista blanca de campos), Edge Functions y **nombres** de secretos |
| `jm-qa-tools/compare_inventory.mjs` | Compara el inventario de QA con la línea base M24 y genera la matriz de la §3 y la decisión de migración (Fases A–C de `MISION_26/06_T6_QA.md`) |
| Línea base M24 | Generada con el mismo script sobre el stack local recién reconstruido (34 tablas, 2 vistas, 32 funciones, 57 políticas, 2 buckets, PG 15). Fuera del repositorio |

Salvaguardas verificadas en local:
- Solo `SELECT` sin `;` y sin palabras de escritura; cualquier otra consulta se rechaza antes de enviarse.
- Vía psql: sesión con `default_transaction_read_only=on` (comprobado: PostgreSQL rechaza un `UPDATE` con «cannot execute UPDATE in a read-only transaction»).
- Referencia fija: solo `yomgxdjgfjnrjaqiarvw` o local. La referencia de Production está **bloqueada** (comprobado: exit 3).
- La salida no contiene valores de secretos, correos completos ni datos personales.
- Comparador probado: línea base contra sí misma → todo PASS; con un QA simulado con legado (versión heredada, tabla POS sin RLS, bucket y RPC ausentes) → detecta cada diferencia y decide «A3: detenerse».

## 2. Cómo ejecutar el inventario (elegir una vía)
| Vía | Requisito | Cubre | Riesgo |
|---|---|---|---|
| **A. La ejecuta el propietario** (recomendada; es la política de M26: los agentes no reciben credenciales de QA) | Supabase CLI o `psql` en su equipo + contraseña de la BD de QA | Todo menos Auth/Edge/secretos (esos 3 se miran en el panel) | Ninguno para el agente; el JSON resultante no tiene secretos y se puede compartir |
| B. API de gestión desde esta sesión | Permitir `api.supabase.com` en la red de la sesión + un token de acceso personal | Todo, incluidos Auth, Edge Functions y nombres de secretos | El token personal da acceso a **todos** los proyectos de la cuenta (también Production). El script solo llama a QA, pero el token en sí no está limitado |
| C. psql desde esta sesión | La red de la sesión solo admite HTTPS: el puerto 5432/6543 de Postgres no es alcanzable aquí | — | No viable en este entorno |

Vía A, en el equipo del propietario (la contraseña no se escribe en archivos ni en la conversación):

    QA_DB_URL='postgresql://postgres.yomgxdjgfjnrjaqiarvw:<contraseña>@<pooler-de-QA>:5432/postgres' \
      node jm-qa-tools/inventory.mjs --target qa --via psql --out ~/jm-privado/qa_inventory.json
    node jm-qa-tools/compare_inventory.mjs <línea-base.json> ~/jm-privado/qa_inventory.json --md ~/jm-privado/qa_matriz.md

(La línea base se regenera igual con `--target local` sobre el stack local.)

## 3. Matriz de preparación (estado actual: sin acceso a QA)
| Componente | Estado QA | Requisito (M24 + frontend M27/M28) | Acción necesaria | Clasificación |
|---|---|---|---|---|
| Esquema M24 | Desconocido | 34 tablas + 2 vistas, 32 funciones, enums idénticos; sin objetos POS | Inventario → decisión A1/A2/A3 | BLOCKED |
| Productos | Desconocido | `products`, `variants`, `product_images`, catálogo con datos | Inventario; cargar catálogo si está vacío | BLOCKED |
| Inventario | Desconocido | `inventories`, `inventory_movements`, `inventory_reservations`, `v_variant_availability`, `admin_adjust_inventory` | Inventario | BLOCKED |
| Pedidos | Desconocido | `online_orders`, ítems, catálogo de 8 estados, transiciones, `create_order`, `get_order_public`, `cancel_my_order`, `admin_transition_order` | Inventario | BLOCKED |
| Pagos | Desconocido | `payment_transactions`, `webhook_events`, `create_payment_attempt`, `apply_payment_event` idénticas a M24 | Inventario | BLOCKED |
| Usuarios | Desconocido | Cuentas de prueba cliente/admin con contraseña conocida solo por el propietario | Inventario; contraseñas en el panel | BLOCKED |
| Roles | Desconocido | `app_role` {customer, admin, super_admin}; ≥1 admin | Inventario | BLOCKED |
| RLS | Desconocido | RLS en todas las tablas y las 57 políticas de M24 | Inventario | BLOCKED |
| Storage | Desconocido | Buckets públicos `product-images` y `site-content` (5 MB, imágenes), escritura solo admin | Inventario | BLOCKED |
| Auth redirects | Desconocido | Site URL del frontend QA + `/cuenta`, `/cuenta/restablecer`, `/checkout/confirmacion` | Panel o vía B | BLOCKED |
| Edge Functions | Desconocido | `wompi-webhook` activa con `verify_jwt=false` | Panel o vía B | BLOCKED |
| Secrets | Desconocido | `WOMPI_EVENTS_SECRET` (sandbox) y `APP_ENV=qa` en la Edge Function | Panel (solo nombres) o vía B | BLOCKED |
| Configuración local QA (11 variables) | No existe ningún archivo QA | Las 11 variables de `config/env/qa.env.example` | Crear el archivo fuera del repo | FAIL |
| Lista de permitidos | `yomgxdjgfjnrjaqiarvw.supabase.co` añadido (M28, sin commit) | Host QA en `config/environments.json` | — | PASS (local) |

## 4. Configuración local QA (Fase 3)
No hay archivo QA en esta sesión. Ejecuté `check:qa` sobre una copia vacía de la plantilla: el validador detecta
las 11 variables ausentes y los dos `APP_ENV` incorrectos. Validaciones ya implementadas (M26) que se aplicarán al
archivo real:

| Comprobación | Dónde |
|---|---|
| URL de QA en la lista de permitidos y en https | `check:qa` |
| Llave anon: JWT con `role=anon` y `ref` = QA (nunca la de servicio en el navegador) | `check:qa` |
| Llave de servicio con `ref` = QA | `check:qa` |
| `APP_ENV=qa` y `VITE_APP_ENV=qa` | `check:qa` |
| Wompi: `pub_test_`, `test_integrity_`, `test_events_`; `VITE_WOMPI_ENV=sandbox` | `check:qa` |
| Ninguna llave/secreto de Production; ninguna URL de Production | `check:qa` + guardas en ejecución (servidor y Edge) |
| Bundle sin secretos: solo el host QA, solo las 5 variables de cliente, ningún JWT que no sea anon, ningún nombre de secreto | `build:qa` (verificación del bundle) |

Variables que faltan (todas): `VITE_APP_ENV`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_WOMPI_PUBLIC_KEY`,
`VITE_WOMPI_ENV`, `APP_ENV`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`,
`WOMPI_EVENTS_SECRET`. Pasos: crear `~/jm-privado/qa.env` (fuera del repo) → `pnpm check:qa -- --file ~/jm-privado/qa.env`
→ `pnpm build:qa -- --file ~/jm-privado/qa.env`.

## 5. Plan de migración (Fase 4) — no se ejecuta en M29
1. **Copia** (Fase A de M26, propietario): `supabase db dump --remote=yomgxdjgfjnrjaqiarvw` de esquema, datos y roles a un
   directorio privado; comprobar que no están vacíos; anotar la última copia/PITR del plan.
2. **Inventario** con `jm-qa-tools/inventory.mjs` y **comparación** con `compare_inventory.mjs`.
3. **Decisión** según el comparador:

| Resultado | Vía | Riesgo |
|---|---|---|
| A1 — `public` vacío y sin historial | `supabase db push --remote=yomgxdjgfjnrjaqiarvw --dry-run`, revisar, después sin `--dry-run` | Bajo: solo crea objetos |
| A2 — historial = prefijo del repo | Igual, aplica solo pendientes | Bajo |
| A3 — historial heredado (las 16 versiones pre-M24) u objetos ajenos | **Detenerse.** M24 no es incremental sobre el legado: crea tipos, tablas y funciones con nombres que ya existirían (`CREATE TYPE`/`CREATE TABLE` fallarían) | Alto |

4. **Si A3** (lo más probable según M24A: QA tuvo cambios manuales), opciones para decidir con el inventario a la vista:
   - **A3-R — Recrear (Fase C):** solo si el inventario muestra que no hay datos ni usuarios que conservar (o se exportan
     aparte), con decisión escrita y fechada del propietario. `supabase db reset --remote=yomgxdjgfjnrjaqiarvw`
     (nunca `--linked`), después `migration repair --status reverted` de las versiones heredadas, una a una.
   - **A3-M — Migración de datos:** si hay datos que conservar (usuarios reales de prueba, productos cargados a mano),
     exportarlos, recrear y reimportar con un script de transformación revisado. Más esfuerzo (§8).
5. **Protección de datos:** copia de la Fase A verificada antes de cualquier orden; usuarios de `auth` exportados aparte
   (`--role-only` + listado de `auth.users`); Storage: listado de objetos por bucket y descarga si se conservan.
6. **Integridad después:** repetir `inventory.mjs` y `compare_inventory.mjs` → todas las filas de esquema, RPC, RLS y
   Storage en PASS; `migration list` = repositorio; recuentos de lo que se haya reimportado = recuentos de la Fase A;
   pruebas de humo de la §6 (lectura de catálogo con la llave anon, RPC admin rechazadas para un cliente).
7. **Riesgos:** borrar usuarios o pedidos que alguien usa (mitigación: inventario + export + decisión escrita);
   ejecutar contra Production (mitigación: referencia explícita, guardas del script, nunca `link`/`--linked`);
   contraseñas seed comprometidas si QA se cargó con seeds de M24–M25 (mitigación: rotarlas ya); PG distinto de 15
   (mitigación: detenerse); Edge Function con `verify_jwt=true` (mitigación: comprobar en el panel tras desplegar).

## 6. Plan de validación comercial en QA (Fase 5)
Los recorridos de M27/M28 están escritos para el stack local (`lib_local.cjs` aborta fuera de 127.0.0.1, fija
contraseñas con la API admin y comprueba la BD con `psql`). Para QA hace falta una variante `lib_target.cjs`:
contraseñas de las cuentas de prueba desde variables de entorno del propietario, comprobaciones de BD con la llave de
servicio por REST (sin psql) y pagos reales de Wompi Sandbox en lugar de eventos firmados localmente.

| # | Recorrido | Script base | Verificación en QA |
|---|---|---|---|
| 1 | Cliente nuevo | `e2e_commercial.cjs` §4 | Registro (correo de confirmación según Auth de QA), pedido asociado a la cuenta |
| 2 | Cliente recurrente | `e2e_commercial.cjs` §5, `e2e_quality.cjs` | Historial, carrito persistente, segunda compra |
| 3 | Compra con cupón | `e2e_commercial.cjs` §4 | Descuento calculado por `quote_cart`/`create_order` |
| 4 | Compra sin cupón | `e2e_commercial.cjs` §5 | Descuento 0, envío según umbral |
| 5 | Pago Sandbox aprobado | `wompi_sandbox.cjs CASE=approved` y `CASE=nequi` | Firma aceptada por Wompi, webhook real → «Pago confirmado» |
| 6 | Pago rechazado | `wompi_sandbox.cjs CASE=declined` | Pedido pendiente, reintento con nueva referencia |
| 7 | Pago pendiente | `wompi_sandbox.cjs` (fase PENDING) + widget manual | Pedido «Pago pendiente» mientras Wompi procesa |
| 8 | Administración de productos | `e2e_commercial.cjs` §1, `e2e_admin.cjs` | Producto con imagen en Storage QA visible en la tienda |
| 9 | Gestión de inventario | `e2e_commercial.cjs` §2 | Movimiento con motivo, disponibilidad actualizada |
| 10 | Gestión de pedidos | `e2e_commercial.cjs` §6 | Preparación → enviado (guía) → entregado visible al cliente |
| 11 | Cambio de portada | `e2e_site_content.cjs` | Persistencia, otro navegador, permisos |
| 12 | Lista de deseos | `e2e_wishlist.cjs` | Fusión, 2 dispositivos, RLS |

Además: `e2e_session.cjs` (rutas protegidas y expiración) y `e2e_cart_variant.cjs` (sin el precio especial temporal,
que en QA no se modificaría por SQL). Los datos de prueba se identifican con un sello (`E2E-<fecha>`) y se archivan al
final desde el panel (nunca se borran pedidos).

## 7. Orden recomendado de ejecución
1. Elegir la vía del inventario (§2) → ejecutar inventario y comparación (solo lectura).
2. Rotar las contraseñas seed si aparecen en QA (independiente de todo lo demás).
3. Decisión de migración con la matriz a la vista (A1/A2/A3) → autorización escrita.
4. Copia (Fase A) → migración (dry-run, aplicar) → inventario de integridad.
5. Storage, Auth (Site URL y redirects), usuarios de prueba y rol admin.
6. Archivo QA local (11 variables) → `check:qa` → `build:qa` → `preview:qa` contra QA.
7. Edge Function `wompi-webhook` (secretos sandbox, `verify_jwt=false`) y URL de eventos en el panel sandbox de Wompi.
8. Recorridos 1–4 y 8–12 con `preview:qa`/`dev:qa`; después 5–7 con Wompi Sandbox.
9. Despliegue Preview en Vercel solo con su autorización y repetición de los recorridos sobre la URL de Preview.

## 8. Estimación de esfuerzo
| Bloque | Agente | Propietario |
|---|---|---|
| Inventario + matriz (con acceso) | 0,5 h | 15 min (vía A) |
| Migración A1/A2 | 1 h (incluye verificación) | 15 min de aprobación |
| Migración A3-R (recrear) | 1,5 h | 30 min (copia, decisión escrita) |
| Migración A3-M (conservar datos) | 4–6 h | 1 h (qué conservar) |
| Storage, Auth, usuarios, roles | 0,5 h de guía y verificación | 30 min en el panel |
| Archivo QA + `check:qa`/`build:qa` | 0,5 h | 15 min |
| Adaptar los recorridos a QA (`lib_target.cjs`) | 2–3 h | — |
| Edge Function + Wompi Sandbox | 1 h | 30 min (panel Wompi y secretos) |
| Recorridos 1–12 y corrección de defectos | 3–5 h | — |
