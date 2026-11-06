# M25 — Primera ejecución en GitHub Actions y corrección de db-local

## Ejecución 42181794518 (commit 9fa7d4f, evento push, 2026-11-06)
https://github.com/unjuandice3333-star/j-M/actions/runs/42181794518 — **failure**

| Job | Resultado |
|---|---|
| governance, quality, security, db-supabase | success |
| db-local | **failure** |
| trusted-policy | skipped (solo se ejecuta en `pull_request`; en push no se exige) |
| ci-gate | failure (consecuencia de db-local) |

Con esta ejecución quedan verificados en el runner tres puntos que estaban "sin verificar": la instalación de los paquetes
apt de PostgreSQL 16, pgTAP y pg_cron; `supabase/setup-cli` con la 3.0.0 (db-supabase en success); y gitleaks en Docker
con el usuario del runner (security y quality en success).

## Causa de db-local (reproducida en local)
`supabase/tests/run_local.sh` creaba el clúster efímero con el usuario del sistema (`whoami`) como superusuario. En local
la etapa siempre corrió con `su postgres`; en GitHub corre como `runner`. La migración base solo permite cambiar el rol de
un usuario a `postgres`/`supabase_admin` (trigger), por lo que el seed `00_qa_users.sql:37` falló con
`El rol solo puede cambiarse con admin_set_user_role()`. Se ejecutaron 0 pruebas, y la compuerta de mínimo (290) bloqueó
correctamente.

Reproducción: `su runner -c "WORKDIR=… OUTDIR=… bash scripts/ci/db_local.sh"` → rc=1, 0 pruebas.

## Corrección (mínima; sin tocar migraciones)
`PG_SUPERUSER` (por defecto `postgres`, como en Supabase) para `initdb -U` y para todas las conexiones (`psql`, `pg_prove`).
Verificado como `runner` y como `postgres`: rc=0, 290 pruebas, determinismo OK.

## Lección para la fábrica
Las validaciones locales de BD usaban un único usuario del sistema. Una diferencia de entorno (usuario del runner) solo
apareció en GitHub. Las etapas de BD deben probarse también con un usuario distinto de `postgres` antes de declarar
la portabilidad.
