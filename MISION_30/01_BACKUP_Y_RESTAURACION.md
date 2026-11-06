# M30 — 01. Copia de seguridad de QA y restauración verificada

> **M30.2:** las herramientas operativas citadas aquí (`inventory.mjs`, `compare_inventory.mjs`, `backup_logical_api.mjs`, `backup_qa_owner.sh`, `restore_dump_local.sh`) no se versionan en el repositorio (regla 6 de `20_migrations_policy`: ningún ejecutable versionado puede contener operaciones remotas de Supabase). Se entregan aparte como kit `jm-qa-tools` con sus huellas SHA-256; ver `MISION_30_2/00_DECISION_Y_VERSIONADO.md`.

**Proyecto:** QA `yomgxdjgfjnrjaqiarvw` (`jm-fashion-qa`, ca-central-1, PostgreSQL 17.11). Production no se consultó.
**Regla:** una copia solo es válida si se ha **restaurado** en un entorno aislado y la verificación coincide; que el comando
de exportación termine no basta.

## 1. Dos copias complementarias
| | A. Copia lógica (agente, **ejecutada**) | B. Copia autoritativa (propietario, **preparada**) |
|---|---|---|
| Script | `jm-qa-tools/backup_logical_api.mjs` | `jm-qa-tools/backup_qa_owner.sh` |
| Acceso | API de gestión, endpoint de consultas **de solo lectura**; token inyectado por el proxy | Supabase CLI en el equipo del propietario (contraseña de la BD que pide el CLI; token en la terminal) |
| Esquema | Catálogo completo (columnas, restricciones, índices, funciones, triggers, vistas, políticas, enums, secuencias) + SQL de las 28 migraciones | `pg_dump` del esquema |
| Datos `public` | Las 27 tablas, cada fila como texto exacto de `row_to_json` generado en QA (NDJSON) | `pg_dump --data-only --use-copy --schema public` |
| Historial | `supabase_migrations.schema_migrations` con su SQL (incluye las 12 versiones que no están en el repositorio) | Volcado de datos de `supabase_migrations` + `migration list` |
| `auth` | Solo identificación de la cuenta (id, correo enmascarado, rol), **sin** hash de contraseña | Volcado de datos de `auth` (incluye hashes: guardar cifrado) |
| Storage | Metadatos de buckets y objetos | Metadatos + **archivos** de todos los buckets (`storage cp -r`) |
| Edge Functions | Metadatos + código desplegado (`wompi-webhook` v3) | `functions download` + metadatos |
| Secretos | **Solo nombres** | **Solo nombres** |
| Auth (config) | Configuración sin claves con nombre de secreto | Ídem |
| Integridad | `MANIFEST.json`: tamaño, SHA-256, fecha y resultado; relectura y verificación del SHA-256 | `MANIFEST.tsv` ídem + comprobaciones de contenido |

Ambas se guardan **fuera del repositorio**, con permisos 700/600 y sin credenciales.
**La copia A vive en el contenedor de esta sesión, que es efímero**: no sustituye a la B. La B debe quedar en el equipo del
propietario (preferiblemente cifrada) antes de cualquier reconstrucción.

## 2. Resultado de la copia A (ejecutada el 2026-11-06 21:58 UTC)
- 36 archivos, **54.464.761 bytes**, 27 tablas, **0 ilegibles** (cada archivo se relee y se recalcula su SHA-256; los
  JSON/NDJSON se parsean).
- Archivos principales (SHA-256 abreviado; el completo en `MANIFEST.json`):

| Archivo | Bytes | SHA-256 |
|---|---|---|
| `01_schema_migrations.json` (28 migraciones con SQL) | 225.404 | `02a9b24923153e12…` |
| `02_catalog.json` | 133.392 | `6ef6f913070ca8a4…` |
| `03_checksums_qa.json` (sumas de control calculadas en QA) | 2.146 | `7c283e8f2e43eebe…` |
| `04_auth_accounts.json` | 227 | `d27055848d709e48…` |
| `functions/wompi-webhook.body` (código v3) | 696.871 | `731f5adc48ca6742…` |
| `data/*.ndjson` (27 tablas) | ~53 MB (`audit_logs` y `variants` ≈ 26 MB cada una) | en el manifiesto |

- Cuenta administradora identificada (el identificador y el correo quedan solo en la copia privada): confirmada, proveedor email, rol `admin`,
  creada 2026-10-21, último acceso 2026-11-04.
- Storage: bucket `editorial_images` con **1 objeto** (`banners/hero_main_…jpg`, 2,9 MB). El archivo **no** está en la copia A
  (el host de Storage no es alcanzable desde esta sesión): lo descarga la copia B.
- Secretos de la Edge Function (nombres): `WOMPI_EVENTS_SECRET` + los inyectados por Supabase. Falta `APP_ENV`.
- Observación: `payment_transactions.raw_response` contiene dos `device_data_token` (JWT de huella de dispositivo emitidos
  por Wompi en pruebas). No son credenciales del proyecto, pero la copia debe tratarse como confidencial.

## 3. Prueba REAL de restauración (copia A) — PASS
Entorno: stack Supabase local **aislado** (`project_id = jm-qa-restore`, PostgreSQL 17.11, sin migraciones ni seeds),
script `scripts/qa/restore_test_local.py`:
1. Comprueba el SHA-256 de cada archivo de la copia.
2. Reproduce las 28 migraciones de QA con **su propio SQL** (una transacción por migración) y registra el historial.
3. Crea en `auth.users` la cuenta referenciada (solo el id, correo ficticio, sin contraseña).
4. Vacía las tablas locales (las migraciones de QA insertan datos de referencia y el alta crea perfiles) y carga los
   datos con `session_replication_role = replica`; fija las secuencias.
5. Verifica con el **mismo cálculo** que se hizo en QA: `md5` de las filas ordenadas con `COLLATE "C"`.

| Verificación | Resultado |
|---|---|
| Migraciones de QA reproducidas | **28/28** |
| Tablas con suma de control idéntica a QA | **27/27** |
| Filas huérfanas en claves externas | **0** |
| Índices / triggers / columnas frente a QA | 72/72 · 9/9 · idénticos |

Defectos encontrados y corregidos durante la prueba (por eso se exige restaurar):

| Defecto | Causa | Corrección |
|---|---|---|
| 7 tablas no cargaban | Las migraciones de QA insertan datos de referencia | Vaciar tablas locales antes de cargar |
| `audit_logs` con suma distinta | El orden del `string_agg` dependía de la intercalación del servidor | `COLLATE "C"` en ambos lados |
| `audit_logs` seguía distinta | La API reserializa JSON y normaliza números (`129900.00` → `129900`) en columnas `jsonb` | Exportar cada fila como **texto** generado por PostgreSQL |
| Exportación cortada | Respuestas de ~26 MB | Paginación de 50 filas |

## 4. Deriva de esquema detectada en QA (estado real ≠ su propio historial)
Al comparar la restauración (historial reproducido) con el inventario real de QA:
- `public.rls_auto_enable()` existe en QA y **ninguna migración la crea**.
- RLS activada a mano en `collections`, `role_permissions` y `seasons`.
- La política `profiles.profiles_update_own_policy` la crea el historial y **ya no existe** en QA.
- Columnas, índices (72) y triggers (9): idénticos.

Conclusión: el historial no basta para reproducir QA; la copia autoritativa debe ser el **`pg_dump` del estado real** (copia B).

## 5. Procedimiento de la copia B (propietario)
    export SUPABASE_ACCESS_TOKEN=…                      # en su terminal; no se escribe en archivos
    bash jm-qa-tools/backup_qa_owner.sh ~/jm-privado/qa-backup
    # → ~/jm-privado/qa-backup/qa_<fecha>/{db,storage,functions,config}/ + MANIFEST.tsv

Comandos que ejecuta (todos de lectura, referencia explícita):

    supabase db dump --remote=yomgxdjgfjnrjaqiarvw -f db/schema.sql
    supabase db dump --remote=yomgxdjgfjnrjaqiarvw --data-only --use-copy --schema public -f db/data_public.sql
    supabase db dump --remote=yomgxdjgfjnrjaqiarvw --role-only -f db/roles.sql
    supabase db dump --remote=yomgxdjgfjnrjaqiarvw --data-only --use-copy --schema auth,storage,supabase_migrations -f db/data_auth_storage_history.sql
    supabase migration list --remote=yomgxdjgfjnrjaqiarvw
    supabase storage cp -r ss:///<bucket> storage/<bucket> --remote=yomgxdjgfjnrjaqiarvw --experimental
    supabase functions download wompi-webhook --remote=yomgxdjgfjnrjaqiarvw --use-api
    supabase secrets list --remote=yomgxdjgfjnrjaqiarvw          # se guardan solo los nombres
    GET /v1/projects/yomgxdjgfjnrjaqiarvw/config/auth           # se descartan las claves con nombre de secreto

## 6. Restauración de la copia B (prueba obligatoria antes de reconstruir)
    bash jm-qa-tools/restore_dump_local.sh ~/jm-privado/qa-backup/qa_<fecha> <dir de la copia lógica A>

Sobre un stack local recién creado con PG 17 y sin migraciones: roles → esquema → auth/storage/historial → datos de `public`
(`session_replication_role = replica`) → verificación: tablas, usuarios, objetos de Storage = archivos de la copia, versiones
del historial y **sumas de control frente a la copia A** (dos copias independientes deben coincidir).

**Ensayo realizado** con volcados generados con los mismos comandos del CLI desde la réplica local de QA: **PASS**
(27 tablas, 1 usuario, 28 versiones, **27/27 sumas idénticas**). El ensayo detectó y corrigió dos defectos del script:
datos de `auth`/`storage` en el volcado por defecto (se separó `--schema public`) y un `TRUNCATE … CASCADE` que vaciaba
`public` (eliminado: el stack nuevo se comprueba vacío, no se borra nada).
Pendiente de la copia real: subir los archivos de Storage a un stack local y comprobar su SHA-256 (1 objeto).

## 7. Restauración de QA a partir de la copia (plan de vuelta atrás)
Si la reconstrucción falla y hay que volver al estado anterior (operación remota, requiere autorización). **Esta vuelta
atrás no se ha ensayado completa en M30** (sí su parte de restauración, §6): ensayarla en local antes de depender de ella.
1. `supabase db reset --remote=yomgxdjgfjnrjaqiarvw --no-seed` con un directorio de migraciones **vacío** (deja `public` vacío).
2. `psql "<URL de QA>" --single-transaction -v ON_ERROR_STOP=1 -f db/roles.sql -f db/schema.sql -c 'SET session_replication_role = replica' -f db/data_public.sql`
3. Datos de `auth`, `storage` e historial con el mismo patrón; archivos de Storage con `supabase storage cp -r storage/<bucket> ss:///<bucket> --remote=yomgxdjgfjnrjaqiarvw --experimental`.
4. Redesplegar la función descargada; volver a fijar `WOMPI_EVENTS_SECRET`.
5. Verificar con `inventory.mjs` frente al inventario M29/M30 (todo igual) y las sumas de control de la copia A.
