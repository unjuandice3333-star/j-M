# M24C — EVIDENCIAS E INSTRUCCIONES DE REPRODUCCIÓN

Todas las evidencias están en `MISION_24C/evidencias/`:
- **Llaves redactadas.** Se eliminaron las líneas con llaves de demostración locales y JWT; se comprobó con grep que no queda ninguna.
- **Registros más cortos.** Se quitaron las líneas de progreso de descarga de imágenes.

## 1. Índice

| Archivo | Qué demuestra |
|---|---|
| `run1_start.log` | `supabase start` en instalación limpia: migración base + 3 seeds aplicados; única advertencia H3 |
| `run1_reset.log` | `supabase db reset` exitoso |
| `official_pgtap_functional.log` | `supabase test db`, 10 suites funcionales: **278/278 PASS** (instalación 1) |
| `run2_start.log`, `run2_pgtap_functional.log` | Instalación 2 independiente: start OK y **278/278 PASS** |
| `official_pgtap_concurrency_asis.log` | Suite de concurrencia **sin cambios**: falla por `dblink` (H2) |
| `concurrency_adaptation.diff` | Las 2 líneas de adaptación (crear dblink; conexión con contraseña por la IP del contenedor) |
| `official_pgtap_concurrency_adapted.log` | Concurrencia adaptada: **12/12 PASS** |
| `run1_test_default.log`, `auth_uid_before.txt`, `auth_uid_after.txt` | Experimento `supabase test db` sin ruta: el shim no se ejecuta y `auth.uid()` no cambia |
| `gotrue_error_seed_login.txt` | Error 500 de GoTrue con los usuarios seed (H1) |
| `services_results_before_auth_fix.json` | Validación HTTP antes de la corrección H1: 23/39 (fallos en cascada por falta de JWT) |
| `auth_seed_fix.sql` | Corrección H1 aplicada **solo** al stack local |
| `services_results_official.json` | Validación HTTP final en BD recién reseteada: **39/39** |
| `pg_cron_evidence.txt` | Disparo real del job y vencimiento del pedido `JM-001038` |
| `snapshot_A/`, `snapshot_B/` (+ `checksums.md5`) | Instantáneas de dos reconstrucciones independientes: **checksums idénticos** |
| `scripts/services_check.py`, `scripts/snapshot.sh` | Scripts usados (reutilizables) |
| `run1_stop.log` | Parada con `--no-backup` (volúmenes locales eliminados) |

### Checksums de las instantáneas (A = B)
```
a7e7cae2dc3ae725089e6e96e0327943  privileges.txt
8d8d85756cbe70c71f520e000c61ee94  constraints.txt
43f40bca0bd346037ab8e1462a2138b1  functions.txt
5ec2e5b538f1cbe1df2f7b3ed47b9b46  policies.txt
9d0f683e428a35b26bc43f2d13d5dc95  reference_data.txt
9671cd7cff10d8ba1fe57bc5ffb45c10  seeds.txt
07b58d76632b4e2c9a8c919936ce52a6  schema_normalized.sql
```

## 2. Cómo reproducir en otro equipo

Requisitos: Docker en ejecución, Node 18+ y git. **No enlazar ningún proyecto remoto** (`supabase link`) ni exportar `SUPABASE_ACCESS_TOKEN`.

1. Exportar el commit validado a un directorio limpio:
```bash
mkdir -p /tmp/jm-m24c && git -C /ruta/al/repo archive 9183090 | tar -x -C /tmp/jm-m24c
```
2. Instalar Supabase CLI fuera del repositorio:
```bash
cd /tmp/jm-m24c && npm i --no-save supabase@3
```
3. Levantar el stack local (aplica la migración y los seeds):
```bash
npx supabase start -x studio,realtime,edge-runtime,logflare,vector,imgproxy,mailpit,postgres-meta,supavisor
```
4. Reconstruir y ejecutar las 10 suites funcionales (esperado: 278/278 PASS):
```bash
npx supabase db reset
```
```bash
npx supabase test db $(ls supabase/tests/database/*.test.sql | grep -v concurrency)
```
5. Concurrencia (hasta aplicar H2 en el repo): aplicar `concurrency_adaptation.diff` a una copia de la suite fuera de `supabase/tests/` y ejecutarla. Esperado: 12/12.
```bash
npx supabase test db supabase/tests_adapted_m24c/95_concurrency.test.sql
```
6. Servicios HTTP (hasta aplicar H1 en el repo): primero la corrección del seed, luego el script. Esperado: 39/39.
```bash
docker exec -i supabase_db_jm-fashion-store psql -U supabase_admin -d postgres < auth_seed_fix.sql
```
```bash
npx supabase status -o json > /tmp/status.json && NO_PROXY=127.0.0.1 python3 services_check.py /tmp/status.json /tmp/results.json
```
7. Determinismo: tomar una instantánea, `supabase stop --no-backup`, repetir los pasos 1–3 en otro directorio, tomar otra instantánea y comparar los `checksums.md5`.
```bash
bash snapshot.sh supabase_db_jm-fashion-store /tmp/snapA
```
8. pg_cron: crear un pedido, mover `payment_expires_at` al pasado y esperar el siguiente múltiplo de 5 minutos (ver `pg_cron_evidence.txt`).

## 3. Estado final del entorno
- Stack de Supabase detenido con `--no-backup`: 0 contenedores activos y volúmenes locales eliminados.
- Repositorio sin cambios en código: rama `db/baseline-m24b`, HEAD `9183090` antes de agregar esta documentación.
- Sin conexión a QA ni Production, sin push y sin merge.
