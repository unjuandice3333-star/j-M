# 05 — EVIDENCIAS Y COMANDOS

## 1. Versiones de herramientas
| Herramienta | Versión |
|---|---|
| Docker Engine | 29.9.2 (overlayfs, cgroup v1). El daemon se inició localmente en el contenedor de trabajo |
| Supabase CLI | 3.0.0 (npm, instalada fuera del repositorio) |
| Postgres (Supabase) | `supabase/postgres:15.19.0.016` → PostgreSQL 15.19 |
| GoTrue | `supabase/gotrue:v2.197.0` |
| Storage | `supabase/storage-api:v1.88.0` |
| PostgREST | `postgrest/postgrest:v16.5` |
| Kong | `kong:2.8.1` |
| pg_prove (CLI) | `supabase/pg_prove:3.36` |
| Extensiones | pg_cron 1.6.4, pgcrypto 1.3, pgTAP 1.3.3 (instalada por la CLI durante `test db`), dblink 1.2 (instalada por la prueba de concurrencia) |
| PostgreSQL local (regresión) | 16.15 con pgTAP 1.3.2 y pg_cron 1.6.2 |
| Python / Node | 3.13.18 / 22.23.4 |

## 2. Secuencia de comandos (resumen fiel)

**Preservación:**
```bash
git branch --show-current
```
```bash
git log --oneline -3
```
```bash
git status --short
```
```bash
git bundle create m24d_pre_backup.bundle 2661f2a..db/baseline-m24b && git bundle verify m24d_pre_backup.bundle
```
Resultado: rama `db/baseline-m24b`, HEAD `67312b0`, el bundle "is okay".

**H1, investigación** (stack de sondeo con HEAD exportado):
```bash
docker exec supabase_db_jm-fashion-store psql -U postgres -c "select column_name, data_type, column_default from information_schema.columns where table_schema='auth' and table_name='users'"
```
```bash
python3 h1_probe.py status.json
```

**H3, plantilla de referencia:**
```bash
supabase init
```
Ejecutado en un directorio temporal vacío.

**Exportación limpia** (para cada reconstrucción):
```bash
git archive HEAD | tar -x -C cleanN && (cd cleanN && git apply m24d_changes.patch)
```
```bash
diff -r -q cleanN/supabase <repo>/supabase
```
El `diff` sale vacío: la exportación es idéntica al árbol de trabajo.

**Validación** (`evidencias/scripts/validate.sh`, idéntica en ambas reconstrucciones):
```bash
supabase start -x studio,realtime,edge-runtime,logflare,vector,imgproxy,mailpit,postgres-meta,supavisor
```
```bash
supabase db reset
```
```bash
docker exec supabase_db_jm-fashion-store psql … consultas de verificación de seeds
```
```bash
bash snapshot.sh supabase_db_jm-fashion-store <out>/snapshot
```
```bash
supabase test db
```
Sin rutas: el procedimiento oficial.
```bash
supabase status -o json > .status.json && python3 -I services_check.py .status.json 06_http_results.json
```
`.status.json` se borra al terminar y no se guarda.

**pg_cron:** `create_order` + ventana en el pasado; se consulta cada 10 s hasta `expired`, sin llamar `expire_pending_orders()`.

**Entre reconstrucciones:**
```bash
supabase stop --no-backup
```
Resultado: 0 contenedores y 0 volúmenes.

**Regresión local:**
```bash
su postgres -c "WORKDIR=… ./supabase/tests/run_local.sh"
```

## 3. Índice de evidencias (`MISION_24D/evidencias/`)
| Archivo | Contenido |
|---|---|
| `h1_aislamiento_columnas.txt` | Prueba columna a columna de H1 |
| `m24d_changes.patch` | Diferencia exacta frente a `67312b0` (renombrado incluido) |
| `precorreccion_test_db_con_shim.log` | Primera ejecución de M24D: el shim recogido por `test db` (motivo de H2b) |
| `correccion_hallazgo_m24c_shim.txt` | Prueba de que en M24C el shim también se ejecutó (`Files=13`) |
| `run1/`, `run2/` | Por reconstrucción: `01_start.log`, `02_reset.log`, `03_seeds.txt`, `05_test_db.log`, `06_http.log`, `06_http_results.json`, `07_warnings.txt`, `exit_codes.txt`, `snapshot/` (7 artefactos + md5), `09_stop.log` |
| `run1/08_cron_setup.txt`, `run1/08_pg_cron_evidence.txt` | Disparo real de pg_cron |
| `run_local_pg16.log` | Regresión del runner local |
| `scripts/` | `validate.sh`, `snapshot.sh`, `services_check.py`, `h1_probe.py` |

Las llaves locales de demostración se filtraron de todos los registros y se comprobó con grep que no queda ninguna (`eyJ…`, `sb_secret_`, `sb_publishable_`, JWT secret).

## 4. Reproducir en otro equipo
Requisitos: Docker, Node 18+ y git. **No enlazar proyectos remotos ni exportar `SUPABASE_ACCESS_TOKEN`.**

```bash
git -C /ruta/repo archive <SHA_M24D> | tar -x -C /tmp/jm && cd /tmp/jm
```
```bash
npm i --no-save supabase@3
```
```bash
npx supabase start -x studio,realtime,edge-runtime,logflare,vector,imgproxy,mailpit,postgres-meta,supavisor
```
```bash
npx supabase db reset
```
```bash
npx supabase test db
```
Esperado en `test db`: `Files=11, Tests=290, Result: PASS`.

```bash
npx supabase status -o json > /tmp/st.json && NO_PROXY=127.0.0.1 python3 MISION_24D/evidencias/scripts/services_check.py /tmp/st.json /tmp/r.json
```
Esperado: 39/39.

## 5. Identificadores
| Elemento | Valor |
|---|---|
| Commit base M24B | `9183090` (intacto) |
| Commit M24C | `67312b0` (intacto) |
| Árbol `supabase/` validado | `daefb1318501d4198d97a1a09c088fd3d2345308` (`git rev-parse <commit M24D>:supabase` debe coincidir) |
| Commit M24D | Se informa al cierre; no puede incluirse dentro de sí mismo |
| Respaldo previo | `m24d_pre_backup.bundle` (scratchpad de la sesión, verificado) |
