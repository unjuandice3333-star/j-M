# M24C — RESULTADOS DE RECONSTRUCCIÓN

## 1. Preservación (antes de empezar)

| Verificación | Resultado |
|---|---|
| Rama actual | `db/baseline-m24b` |
| Commit `9183090` existe y es HEAD | Sí |
| Diferencias del árbol de trabajo frente a `9183090` | 0 líneas (solo carpetas de documentación M23 / M24A sin seguimiento) |
| Respaldo | `git bundle` de `2661f2a..db/baseline-m24b` verificado ("is okay") en el scratchpad de la sesión |
| Instalación limpia | Cada ejecución usó una exportación nueva del commit (`git archive 9183090`) en un directorio temporal. El repositorio no se modificó (sin `.temp/` ni `.branches/`) |

## 2. Preparación del entorno

| Paso | Resultado |
|---|---|
| Docker | No había daemon; se inició `dockerd` local (29.9.2, overlayfs, cgroup v1). Prueba `alpine` OK |
| Supabase CLI | `npm i supabase` → **3.0.0** (en el scratchpad, fuera del repositorio) |
| Credenciales remotas | Ninguna variable `SUPABASE_*`, sin proyecto enlazado: la CLI solo podía operar en local |
| Imágenes | `ghcr.io` y `public.ecr.aws` rechazadas por el proxy de red del entorno; la CLI reintentó y usó Docker Hub (mismas versiones) |
| Servicios levantados | Postgres 15.19.0.016, GoTrue v2.197.0, Storage v1.88.0, PostgREST v16.5, Kong 2.8.1 |
| Servicios excluidos (`-x`) | Studio, Realtime, Edge Runtime, Logflare, Vector, imgproxy, Mailpit, postgres-meta, Supavisor (no necesarios para esta validación) |

## 3. Ejecuciones

### 3.1 Instalación 1
| Comando | Salida |
|---|---|
| `supabase start -x …` | exit 0. "Applying migration 20261106120000_baseline_ecommerce.sql…", "Seeding data from supabase/seeds/00_qa_users.sql / 10_qa_catalog.sql / 20_qa_orders.sql…" |
| `supabase db reset` | exit 0. Misma secuencia, "Finished supabase db reset." |
| `supabase test db <10 suites funcionales>` (tras reset) | **Files=10, Tests=278, Result: PASS** |
| `supabase test db supabase/tests/database/95_concurrency.test.sql` | **FAIL**: `function dblink_connect(unknown, text) does not exist` (H2a) |
| Ídem con dblink creado manualmente | **FAIL**: `password is required — Non-superuser cannot connect if the server does not request a password` (H2b) |
| `supabase test db supabase/tests_adapted_m24c/95_concurrency.test.sql` (copia adaptada, 2 líneas) | **Files=1, Tests=12, Result: PASS** |
| `supabase test db` sin ruta, sobre una BD ya usada (experimento) | Falsos fallos por estado previo. **El shim no se ejecutó** (solo `*.test.sql`) |
| `supabase stop --no-backup` | exit 0; contenedores y volúmenes eliminados |

### 3.2 Instalación 2 (independiente)
| Comando | Salida |
|---|---|
| `supabase start -x …` sobre una exportación nueva | exit 0, misma secuencia |
| `supabase test db <10 suites funcionales>` | **Files=10, Tests=278, Result: PASS** |

### 3.3 Errores y advertencias en los registros
| Registro | Contenido |
|---|---|
| start / reset (×3) | Una sola advertencia: `WARN: auth.email.enable_signup is deprecated … use auth.email.enabled` (H3) |
| Migración y seeds | **Sin** WARNING, NOTICE ni ERROR de PostgreSQL. La autoverificación final de la migración base pasó: RLS en todas las tablas, `search_path` en todas las SECURITY DEFINER, enum alineado con el catálogo, privadas no ejecutables por anon, una bodega por defecto |
| pg_cron | `CREATE EXTENSION pg_cron` y `cron.schedule` sin advertencias: el job quedó `active` |

## 4. Determinismo

Se tomaron dos instantáneas con `evidencias/scripts/snapshot.sh` inmediatamente después de reconstruir:
- **A**: instalación 1, tras `db reset`;
- **B**: instalación 2, tras `start`.

| Artefacto | Contenido | A vs B |
|---|---|---|
| `schema_normalized.sql` | `pg_dump --schema-only` de `public` y `private` (4.238 líneas) | **Idéntico** (md5 `07b58d76632b4e2c9a8c919936ce52a6`) (\*) |
| `privileges.txt` | ACL de tablas, vistas, secuencias y funciones | **Idéntico** |
| `constraints.txt` | 188 restricciones con su definición | **Idéntico** |
| `functions.txt` | md5 de la definición de cada función y trigger | **Idéntico** |
| `policies.txt` | 57 políticas `public` + `storage` con USING / WITH CHECK (77 líneas) | **Idéntico** |
| `reference_data.txt` | Bodega, marca, tallas, colores, categorías, líneas, ocasiones, envíos, estados, transiciones, buckets, job cron | **Idéntico** |
| `seeds.txt` | Usuarios + perfiles, productos, colores, imágenes, variantes con stock, cupones, redenciones, pedidos, líneas, intentos, movimientos, reservas, eventos, reembolsos, reseñas, webhooks (excluye ids aleatorios, tokens y marcas de tiempo) | **Idéntico** |

(\*) El `pg_dump` crudo difería solo en la línea `\restrict <token>` / `\unrestrict <token>`: un nonce aleatorio de seguridad que las versiones recientes de `pg_dump` añaden en cada volcado. Se eliminó al normalizar. No es una diferencia de esquema.

Columnas excluidas por ser aleatorias por diseño: `online_orders.id`, `public_token`, ids de eventos, intentos, movimientos y reservas, marcas de tiempo y el hash bcrypt de las contraseñas (sal aleatoria). Los números de pedido, los importes, los estados y los SKU sí se comparan y coinciden.

## 5. Coincidencia con M24B (PostgreSQL 16)
Los 8 pedidos de los seeds producen exactamente los mismos números, estados y totales que en M24B:

| Pedido | Estado | Total |
|---|---|---|
| JM-001000 | delivered | 449.700 |
| JM-001001 | processing | 174.900 |
| JM-001002 | paid | 131.910 |
| JM-001003 | payment_pending | 249.900 |
| JM-001004 | expired | 174.900 |
| JM-001005 | cancelled | 204.900 |
| JM-001006 | refunded | 229.900 |
| JM-001007 | cancelled | 144.900 |
