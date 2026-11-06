# Evidencias — Misión 23

Todas las pruebas se ejecutaron **localmente** (PostgreSQL 16 efímero y copia temporal del repo). Ningún archivo se ejecutó contra Supabase QA/Production, Vercel o Wompi.

| Archivo | Qué contiene |
|---|---|
| `shim.sql` | Shim mínimo de Supabase (roles anon/authenticated/service_role, `auth.users`, `auth.uid()`, `auth.role()`) usado solo en la BD local |
| `rebuild_run1.txt` | Resultado de aplicar las 16 migraciones en orden, cada una en su transacción |
| `runtime_tests.sql`, `runtime_tests2.sql` | Pruebas funcionales SQL T1–T13 |
| `runtime_tests_output.txt` | Salida de T1–T16 y de `get_commercial_dashboard_metrics` |
| `e2e_probe_output.json` | Sondeo Playwright del build (sin env y con Supabase inalcanzable) |
| `capturas/` | Capturas de escritorio (1366×900) y móvil (iPhone 13) |

## Reproducir la reconstrucción de BD (local)
```bash
initdb -D /tmp/pgdata -A trust && pg_ctl -D /tmp/pgdata -o "-p 54329" start
createdb -p 54329 rebuild && psql -p 54329 -d rebuild -f shim.sql
for f in ../../supabase/migrations/*.sql; do psql -p 54329 -d rebuild -v ON_ERROR_STOP=1 --single-transaction -f "$f" || echo "FALLA: $f"; done
```
Las pruebas T14–T16 se ejecutaron en línea con el mismo patrón (`SET ROLE authenticated` + `request.jwt.claim.*`); su salida está en `runtime_tests_output.txt` y su descripción en `28_AUDITORIA_PRUEBAS_QA.md` §3.
