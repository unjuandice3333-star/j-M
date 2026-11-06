# 06 — COMPATIBILIDAD Y LIMITACIONES

## 1. Diferencias respecto a M24B
| Aspecto | M24B (`9183090`) | M24D |
|---|---|---|
| Migración base | `20261106120000_baseline_ecommerce.sql` | **Sin cambios** |
| Esquema, funciones, políticas, datos de referencia | — | **Idénticos** (instantáneas = M24C) |
| `00_qa_users.sql` | Columnas de token sin valor (4 en NULL en GoTrue real) | 8 columnas de token con `''` explícito |
| `10_qa_catalog.sql`, `20_qa_orders.sql` | — | Sin cambios |
| Suites 01–90 | — | Sin cambios |
| `95_concurrency.test.sql` | Conexión por socket con el rol de sesión; dblink asumido | dblink creado por la prueba; rol efímero con contraseña aleatoria; conexión por red con scram; compradores `anon` y webhook `service_role`; **mismas 12 aserciones** |
| Shim local | `supabase/tests/local_shim/supabase_shim.sql` | `supabase/local_shim/supabase_shim.sql` + columnas de token reales |
| `run_local.sh` | Ruta del shim en `tests/` | Ruta nueva (1 línea) |
| `config.toml` | `[auth.email] enable_signup` (obsoleta) | `[auth.email] enabled` |
| Frontend / backend / migraciones históricas | — | Sin cambios |

Los documentos de M24B y M24C conservan la ruta antigua del shim y la afirmación errónea de M24C sobre el shim; **no se editaron** para preservar los commits como evidencia histórica. Este documento y el informe ejecutivo registran la corrección.

## 2. Compatibilidad verificada
| Entorno | Estado |
|---|---|
| Supabase local con CLI 3.0.0 + Docker (Postgres 15.19) | 290/290 pruebas, 39/39 HTTP, pg_cron real, determinismo |
| PostgreSQL 16 local con shim (`run_local.sh`) | 278 + 12, determinismo |
| `major_version = 15` en `config.toml` | Coincide con la imagen usada |

## 3. Limitaciones conocidas
| # | Limitación | Impacto | Recomendación |
|---|---|---|---|
| L1 | La suite de concurrencia **confirma datos** (COMMIT) y crea/borra un rol | Ejecutarla dos veces sin `db reset` falla la precondición (la unidad del polo ya está reservada) | Ejecutar siempre `supabase db reset && supabase test db` (documentado en la cabecera de la prueba) |
| L2 | Las 10 suites funcionales suponen el estado inicial de los seeds | Falsos fallos sobre una BD ya usada | Ídem |
| L3 | La prueba de concurrencia requiere que `postgres` tenga `CREATEROLE` y pueda conceder `anon` y `service_role`, y que la red de Docker use scram en `pg_hba` | Cumplido en Supabase local; **no** está pensada para ejecutarse contra entornos remotos | No usar `supabase test db --remote` contra QA ni Production |
| L4 | Solo se validó Supabase CLI **3.0.0** con las imágenes indicadas | Otras versiones de GoTrue podrían cambiar columnas de `auth.users` | Revalidar al actualizar la CLI; el seed ya no depende de DEFAULT |
| L5 | Imágenes de `ghcr.io` y `public.ecr.aws` bloqueadas por el proxy del entorno; se usaron las de Docker Hub (mismas etiquetas) | Ninguno funcional | — |
| L6 | El daemon de Docker se inició manualmente en el contenedor de trabajo (no venía activo) | Ninguno sobre los resultados | En otros equipos basta con Docker en ejecución |
| L7 | Servicios excluidos: Studio, Realtime, Edge Runtime, Analytics, imgproxy, Mailpit, postgres-meta, Supavisor | La base no depende de ellos | — |
| L8 | Eventos de Wompi sintéticos; sin Google OAuth ni correo real | Fuera del alcance de la base de datos | Misión de integración con Wompi Sandbox |
| L9 | El frontend y el backend actuales siguen siendo incompatibles con la nueva base (M24B, 28 cambios) | La base **no** debe aplicarse a entornos que sirvan la app actual | Misión de adaptación |
| L10 | La contraseña de QA local (`QaLocal-2026!`) y los correos `@qa.jm.test` están en el seed | Solo local / QA; nunca Production | Mantener los seeds fuera de Production |

## 4. Restricciones respetadas
- Sin conexión a QA ni Production y sin credenciales remotas (ninguna variable `SUPABASE_*`, sin `supabase link`).
- Sin migraciones remotas, despliegues, push ni merge.
- Wompi, Vercel, frontend y backend no se tocaron.
- Migraciones históricas intactas (`supabase/migrations_legacy/`).
- Decisiones de negocio de M24B sin cambios.
- Commits `9183090` y `67312b0` intactos; M24D va en un commit nuevo encima.
- Único artefacto creado por error: `supabase/.temp/cli-latest` (archivo vacío de caché de la CLI). Se generó al ejecutar `supabase --version` con el repositorio como directorio actual y se eliminó de inmediato. Desde entonces, todos los comandos de la CLI se ejecutaron en directorios temporales.
