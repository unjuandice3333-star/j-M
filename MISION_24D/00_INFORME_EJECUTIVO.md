# M24D — INFORME EJECUTIVO

**Fecha:** 2026-11-06 · **Rama:** `db/baseline-m24b` (local) · **Base:** `67312b0` (M24C) sobre `9183090` (M24B)
**Entorno:** Docker 29.9.2 + Supabase CLI 3.0.0 + stack oficial local (Postgres 15.19.0.016, GoTrue v2.197.0, Storage v1.88.0, PostgREST v16.5, Kong 2.8.1). Sin QA, sin Production, sin credenciales remotas.

## Veredicto: **APROBADA** (sujeta a evaluación humana)

H1, H2 y H3 están corregidos en archivos versionados. Toda la validación se ejecutó desde **instalaciones limpias**, en **dos reconstrucciones independientes**, **sin ninguna corrección manual después de `supabase db reset`**.

| Objetivo de la misión | Esperado | Obtenido (reconstrucción 1 / 2) |
|---|---|---|
| Pruebas funcionales | 278/278 | **278/278 / 278/278** |
| Concurrencia, sin adaptación manual | 12/12 | **12/12 / 12/12** (dentro del `supabase test db` oficial) |
| `supabase test db` (procedimiento oficial, sin rutas) | exit 0 | **exit 0 / exit 0**: 11 archivos, 290 aserciones |
| Verificaciones HTTP | 39/39 | **39/39 / 39/39** |
| Login de todos los usuarios sembrados | 4/4 | **4/4 / 4/4** |
| Registro de usuario + perfil | OK | **OK / OK** |
| pg_cron instalado y expiración automática | OK | **OK**: disparo real a las 06:05:00 UTC venció `JM-001038` |
| Reconstrucción determinista | Idéntica | **7/7 artefactos idénticos**, además idénticos a M24C |
| Advertencias en start/reset | Documentar | **0** (la de H3 desapareció) |
| Correcciones manuales tras reset | Ninguna | **Ninguna** |

## Qué se corrigió
| Hallazgo | Causa exacta | Corrección |
|---|---|---|
| **H1** login de usuarios QA → HTTP 500 | GoTrue lee 8 columnas de token como texto no nulo. El seed dejaba NULL las 4 que no tienen DEFAULT: `confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change`. Se aisló columna por columna: **cualquiera** de las 8 en NULL produce el 500 | `00_qa_users.sql` inserta `''` explícito en las 8 columnas. El shim local refleja esas columnas |
| **H2** concurrencia no portable a Supabase | Faltaba `dblink`; en Supabase `postgres` no es superusuario y dblink exige autenticación con contraseña | La prueba crea `dblink` y un **rol efímero con contraseña aleatoria** generada en la propia prueba. Conecta por la dirección de red del servidor (scram-sha-256) y elimina el rol al final. Mismas 12 aserciones y concurrencia real |
| **H2b** (nuevo, detectado en M24D) `supabase test db` ejecutaba el shim | La CLI recoge **todo `*.sql`** bajo `supabase/tests/`. El shim fallaba con `permission denied for schema auth` y dejaba el comando en exit ≠ 0 | El shim se movió a `supabase/local_shim/` (fuera del descubrimiento de pruebas); `run_local.sh` se actualizó |
| **H3** clave obsoleta | `[auth.email] enable_signup` está deprecada en CLI 3.x | `[auth.email] enabled = true`, la clave de la plantilla oficial de CLI 3.0.0. `[auth] enable_signup` se mantiene: es vigente y es el interruptor global de registro |

## Corrección de un dato de M24C
M24C afirmó que `supabase test db` sin ruta **no** ejecutaba el shim. **Era incorrecto.**
- **El registro de M24C lo contradice:** muestra `Files=13`, con el shim incluido; el filtro usado entonces no lo mostró.
- **No hubo daño, pero por los permisos de Supabase, no por diseño.** El shim abortó en `CREATE TABLE auth.users` antes de llegar a reemplazar `auth.uid()`, que permaneció intacta. Se corrigió en M24D (H2b).

## Archivos modificados (5)
`supabase/config.toml`, `supabase/seeds/00_qa_users.sql`, `supabase/tests/database/95_concurrency.test.sql`, `supabase/tests/run_local.sh` y `supabase/tests/local_shim/supabase_shim.sql` → `supabase/local_shim/supabase_shim.sql` (movido y ampliado).
- **Sin cambios:** la migración base, los otros 2 seeds, las otras 10 suites, el frontend, el backend y las 16 migraciones históricas.
- **Esquema, funciones, políticas y datos sembrados:** idénticos a M24C (instantáneas).

## Git
- Commits `9183090` y `67312b0` intactos.
- Commit local exclusivo de M24D sobre `67312b0`; su SHA se informa al cierre de la misión.
- Contenido validado: árbol `supabase/` = `daefb1318501d4198d97a1a09c088fd3d2345308`.
- Sin push y sin merge.

## Pendiente (fuera de alcance de M24D)
Adaptación del frontend y del backend (M24B, 28 cambios); integración real con Wompi Sandbox; diagnóstico de solo lectura de Production (M24-DIAG).
