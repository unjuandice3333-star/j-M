# 01 — CORRECCIÓN H1: USUARIOS DE PRUEBA EN GOTRUE REAL

## 1. Síntoma (M24C)
`POST /auth/v1/token?grant_type=password` con cualquiera de los 4 usuarios del seed → **HTTP 500**. El registro de GoTrue mostraba:
```
error finding user: sql: Scan error on column index 3, name "confirmation_token": converting NULL to string is unsupported
```

## 2. Investigación: columnas exactas
**Esquema real de `auth.users`** (Supabase local, GoTrue v2.197.0; `information_schema.columns`):

| Columna | Tipo | DEFAULT | Valor que dejaba el seed M24B |
|---|---|---|---|
| `confirmation_token` | varchar | **ninguno** | **NULL** |
| `recovery_token` | varchar | **ninguno** | **NULL** |
| `email_change_token_new` | varchar | **ninguno** | **NULL** |
| `email_change` | varchar | **ninguno** | **NULL** |
| `email_change_token_current` | varchar | `''` | `''` |
| `reauthentication_token` | varchar | `''` | `''` |
| `phone_change` | text | `''` | `''` |
| `phone_change_token` | varchar | `''` | `''` |

**Aislamiento** (`evidencias/scripts/h1_probe.py` → `evidencias/h1_aislamiento_columnas.txt`): sobre `cliente1@qa.jm.test`, primero las 8 columnas en `''` y luego **una sola** en NULL cada vez, con login real contra GoTrue.

| Estado | Login |
|---|---|
| Seed M24B tal cual (4 NULL) | **500** |
| Las 8 en `''` | **200** |
| Solo `confirmation_token` NULL | 500 |
| Solo `recovery_token` NULL | 500 |
| Solo `email_change_token_new` NULL | 500 |
| Solo `email_change` NULL | 500 |
| Solo `email_change_token_current` NULL | 500 |
| Solo `reauthentication_token` NULL | 500 |
| Solo `phone_change` NULL | 500 |
| Solo `phone_change_token` NULL | 500 |

**Conclusión:**
- GoTrue exige las **8** columnas no nulas.
- El seed M24B solo rompía 4, porque las otras 4 tienen DEFAULT `''`.
- El shim de M24B no tenía ninguna de estas columnas, por eso no se detectó antes.

## 3. Corrección (versionada)
**`supabase/seeds/00_qa_users.sql`**: el `INSERT INTO auth.users` incluye explícitamente las 8 columnas con `''`.
- No depende de los DEFAULT, que podrían variar entre versiones de GoTrue.
- **No requiere ningún `UPDATE` posterior a `supabase db reset`.**
```sql
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change,
                        email_change_token_current, reauthentication_token, phone_change, phone_change_token,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT …, '', '', '', '', '', '', '', '', …
```

**`supabase/local_shim/supabase_shim.sql`** (solo PostgreSQL local sin Docker): su `auth.users` incorpora las mismas 8 columnas, con los mismos DEFAULT que el esquema real. Así el mismo seed sirve para ambos entornos y el shim deja de ocultar este tipo de diferencia.

No cambia nada más: mismos 4 usuarios, mismos UUID, misma contraseña de QA local (`QaLocal-2026!`), mismas identidades y mismos roles.

## 4. Verificación (dos reconstrucciones limpias, sin pasos manuales)

| Verificación | Reconstrucción 1 | Reconstrucción 2 |
|---|---|---|
| Usuarios QA en `auth.users` | 4 | 4 |
| Identidades QA en `auth.identities` | 4 | 4 |
| Filas con alguna columna de token NULL | **0** | **0** |
| Login `superadmin@qa.jm.test` | 200 | 200 |
| Login `admin@qa.jm.test` | 200 | 200 |
| Login `cliente1@qa.jm.test` | 200 | 200 |
| Login `cliente2@qa.jm.test` | 200 | 200 |
| Contraseña incorrecta | 400 | 400 |
| Registro público (signup) | 200 | 200 |
| Perfil del registro nuevo (trigger) | `customer`, email y nombre correctos | ídem |
| Perfiles de los seeds | superadmin → super_admin, admin → admin, cliente1/2 → customer | ídem |
| JWT reales: `is_admin()` admin / cliente | true / false | true / false |
| Autoasignación de rol por API | 403 | 403 |

Evidencias:
- `evidencias/run1/03_seeds.txt`, `run1/06_http_results.json`;
- ídem en `run2/`.
