# 02 — CORRECCIÓN H2: PRUEBA DE CONCURRENCIA REPRODUCIBLE EN SUPABASE

## 1. Problemas (M24C)
| # | Problema | Error |
|---|---|---|
| a | `supabase test db` habilita pgTAP pero no `dblink` | `function dblink_connect(unknown, text) does not exist` |
| b | En Supabase `postgres` **no** es superusuario (`rolsuper = f`). Para no superusuarios, dblink exige que el servidor **solicite** contraseña, y `127.0.0.1` y el socket son `trust` en `pg_hba` | `password is required — Non-superuser cannot connect if the server does not request a password` |
| c (nuevo, M24D) | `supabase test db` sin rutas ejecuta **todo `*.sql`** bajo `supabase/tests/`, incluido el shim local, que falla y deja el comando en exit ≠ 0 | `supabase_shim.sql: permission denied for schema auth` → `Result: FAIL` |

## 2. Corrección (versionada en la propia prueba)
`supabase/tests/database/95_concurrency.test.sql`. Diferencia completa en `evidencias/m24d_changes.patch`.

1. **Dependencia de dblink:** `CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;` al inicio. Es idempotente y está disponible en la imagen de Supabase (dblink 1.2).
2. **Credencial sin contraseñas fijas ni cambios manuales:**
   - la prueba genera una contraseña aleatoria con `extensions.gen_random_bytes(24)`;
   - crea el rol efímero `jm_test_concurrency LOGIN NOINHERIT` con esa contraseña y le concede `anon` y `service_role`;
   - si quedó un rol de una ejecución interrumpida, lo elimina antes;
   - al terminar ejecuta `DROP ROLE IF EXISTS jm_test_concurrency`. Verificado: 0 roles restantes tras la prueba.
3. **Conexión que satisface a dblink:**
   - `host = COALESCE(host(inet_server_addr()), <socket>)`;
   - con `supabase test db`, pg_prove llega por la red de Docker; `inet_server_addr()` es la IP del contenedor de la BD, cubierta por `scram-sha-256` en `pg_hba`, así que el servidor pide la contraseña;
   - con `run_local.sh` (PostgreSQL local, sesión superusuario por socket), `inet_server_addr()` es NULL y se usa el socket, igual que antes.
4. **Roles realistas:** los dos compradores actúan como `anon` (`SET ROLE anon`) y el webhook como **`service_role`** (`SET ROLE service_role`), igual que la función de Vercel. Antes usaba el rol de sesión.
5. **El shim fuera del descubrimiento de pruebas:** `supabase/tests/local_shim/` → `supabase/local_shim/` (`git mv`), con la ruta actualizada en `supabase/tests/run_local.sh`.

**Lo que NO cambió:**
- **Las 12 aserciones son las mismas**, con el mismo texto y orden.
- La prueba sigue usando **dos conexiones independientes reales**: A abre una transacción y bloquea la fila de inventario, mientras B envía su pedido en paralelo (`dblink_send_query`) y queda **bloqueado** (`dblink_is_busy = 1`). Tras el COMMIT de A, B recibe "Stock insuficiente": un solo pedido, `stock 1 / reservado 1`.
- El escenario de webhook duplicado sigue siendo **en paralelo**.
- No se convirtió en una prueba secuencial.

## 3. Verificación
| Ejecución | Resultado `95_concurrency` | Comando |
|---|---|---|
| Reconstrucción 1 (Supabase) | **12/12 ok** | `supabase test db` (sin rutas, sin pasos manuales) |
| Reconstrucción 2 (Supabase) | **12/12 ok** | ídem |
| PostgreSQL 16 local (regresión) | **12/12 ok** | `supabase/tests/run_local.sh` |
| Rol efímero tras la prueba | 0 restantes | `pg_roles` |

El procedimiento oficial termina con **exit 0**: `Files=11, Tests=290, Result: PASS`.

## 4. Infraestructura de pruebas documentada
| Requisito | Dónde está |
|---|---|
| `dblink` | Creado por la propia prueba (no se añade a la migración base: es solo de pruebas) |
| Rol `jm_test_concurrency` | Creado y eliminado por la propia prueba |
| `pg_hba` con scram para la red de Docker | Configuración estándar del contenedor de Supabase local (no se modifica) |
| Orden de ejecución | `95_…` es el último en orden alfabético. Confirma datos (COMMIT), así que las suites siempre se ejecutan tras `supabase db reset` |

**Precondición:** el rol `postgres` debe tener `CREATEROLE` y poder conceder `anon` y `service_role`. Se cumple en Supabase local (verificado con la imagen `supabase/postgres:15.19.0.016`).
