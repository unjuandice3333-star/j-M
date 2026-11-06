# Informe de CI — J&M FASHION STORE

- **Veredicto:** PASS
- **Perfil / etapas:** `full` / `governance quality security db-local db-supabase`
- **Commit (HEAD):** `9b6fc430cd0e73e025222ecfff36de0f8cc2100c` · **Rama:** `mission/m25-ci-governance`
- **Árbol de trabajo:** LIMPIO · **evidence_valid:** yes
- **Base:** `origin/main` (merge-base `2661f2a7ce09550c0df3fe9b82fd5c43ffd60d5d`)
- **Fecha (UTC):** 2026-11-06T07:01:05Z

| Paso | Estado | Exit | Segundos | Comando |
|---|---|---|---|---|
| 01_branch_name | PASS | 0 | 0 | `bash scripts/ci/check_branch_name.sh mission/m25-ci-governance ` |
| 02_commit_messages | PASS | 0 | 0 | `env PR_TITLE= bash scripts/ci/check_commits.sh 2661f2a7ce09550c0df3fe9b82fd5c43ffd60d5d HEAD` |
| 10_install | PASS | 0 | 1 | `pnpm install --frozen-lockfile` |
| 11_lint | PASS | 0 | 2 | `npx --no-install eslint .` |
| 12_typecheck | PASS | 0 | 1 | `npx --no-install tsc -p tsconfig.ci.json` |
| 13_unit_tests | PASS | 0 | 1 | `npx --no-install vitest run --dir packages` |
| 14_webhook_tests | PASS | 0 | 0 | `node --experimental-test-module-mocks apps/web/scripts/test-webhook-security.mjs` |
| 15_edge_tests | PASS | 0 | 0 | `bash scripts/ci/edge_tests.sh` |
| 16_build | PASS | 0 | 5 | `bash scripts/ci/build.sh` |
| 20_migrations_policy | PASS | 0 | 0 | `bash scripts/ci/migrations_policy.sh` |
| 21_secrets_scan | PASS | 0 | 2 | `bash scripts/ci/secrets_scan.sh` |
| 30_db_local_pg16 | PASS | 0 | 7 | `su postgres -s /bin/bash -c WORKDIR=/tmp/jm_ci_pg_$$ bash '/home/user/unjuandice3333-star/j-m/scripts/ci/db_local.sh'` |
| 31_db_supabase | PASS | 0 | 111 | `bash scripts/ci/db_supabase.sh` |

## Entorno y versiones
```
commit=9b6fc430cd0e73e025222ecfff36de0f8cc2100c
branch=mission/m25-ci-governance
tree_dirty=0
date_utc=2026-11-06T07:01:02Z
os=Linux 6.18.44-fc-v242 x86_64
node=v22.23.4
pnpm=11.0.8
python=Python 3.13.18
postgres_local=postgres (PostgreSQL) 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
pg_prove=pg_prove 3.36
docker=29.9.2
supabase_cli=3.0.0
deno=deno 2.9.6 (stable, release, x86_64-unknown-linux-gnu)
eslint=v9.39.4
typescript=Version 5.9.3
vitest=vitest/2.1.9 linux-x64 node-v22.23.4
gitleaks_image=zricethezav/gitleaks:v8.21.2@sha256:0e99e882…(fijada por digest)
```

Logs completos: `logs/`. Un paso BLOCKED cuenta como fallo; SKIPPED nunca cuenta como aprobado.
