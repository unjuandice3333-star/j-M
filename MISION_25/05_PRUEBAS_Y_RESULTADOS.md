# M25 — Pruebas y resultados

## Validación final sobre el commit definitivo de código `876146a` (árbol limpio)
Comandos (2026-11-06, ver `evidencias/final_876146a/`):
```bash
REQUIRE_CLEAN=1 BASE_REF=origin/main CI_PROFILE=full SUPABASE_BIN=… DENO_BIN=… bash scripts/ci/run_all.sh
bash scripts/ci/gate_selftest.sh
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7 -no-color
```
Estado del árbol antes y después: vacío (`tree_status_before.txt`, `tree_status_after.txt`). `verdict.txt`: `verdict=PASS`, `tree=LIMPIO`, `evidence_valid=yes`.

| # | Validación exigida | Paso | Resultado |
|---|---|---|---|
| 1 | Lint | 11_lint | **PASS**: 0 errores, 24 advertencias (variables sin usar; no bloquean, ver 06 §10) |
| 2 | Typecheck | 12_typecheck | **PASS**: 0 errores (`tsc -p tsconfig.ci.json`, strict) |
| 3 | Build | 16_build | **PASS**: bundle de 1004K; sin nombres de secretos; ningún JWT con privilegios; gitleaks sobre dist sin hallazgos |
| 4 | Pruebas unitarias | 13_unit_tests | **PASS**: 6/6 (vitest) |
| 5 | Pruebas del webhook | 14_webhook_tests (Vercel) + 15_edge_tests (Deno) | **PASS**: 12/12 + 12/12 |
| 6 | Validación de migraciones | 20_migrations_policy | **PASS**: reglas 1-6, base origin/main con la excepción M24B ligada a su SHA, 48 archivos de automatización y 1 workflow |
| 7 | Pruebas completas de Supabase | 31_db_supabase (`supabase test db`) | **PASS**: 290/290 (11 archivos), mínimo exigido 290; 0 advertencias en start/reset |
| 8 | Pruebas HTTP | 31_db_supabase | **PASS**: 39/39 (Auth, PostgREST, RPC, RLS y Storage del stack local) |
| 9 | Determinismo | 31_db_supabase + 30_db_local_pg16 | **PASS**: 7/7 checksums idénticos tras stop/start/reset; huellas PG16 B = C |
| 10 | Autopruebas negativas | gate_selftest.sh | **PASS**: 72/72 (16 controles positivos y 56 negativos con firma de error) |
| 11 | actionlint | actionlint 1.7.7 (incluye shellcheck) | **PASS**: exit 0, sin hallazgos |
| 12 | Perfil completo de CI | run_all.sh full | **PASS**: 13/13 pasos, incluidos 01 rama, 02 commits (con base origin/main), 10 install `--frozen-lockfile`, 21 gitleaks (95 commits y árbol de trabajo, sin hallazgos) y 30 PG16 (278 + 12 de concurrencia = 290) |

Versiones: Node 22.23.4 · pnpm 11.0.8 · PostgreSQL 16.15 · Docker 29.9.2 · Supabase CLI 3.0.0 · Deno 2.9.6 ·
ESLint 9.39.4 · TypeScript 5.9.3 · vitest 2.1.9 · gitleaks 8.21.2 (por digest) · actionlint 1.7.7.

## Historial de ejecuciones completas (todas con árbol limpio y base origin/main)
| Commit | Motivo | CI completa | Autoprueba |
|---|---|---|---|
| aff182e | Primera versión tras la revisión 1 | PASS 13/13 | 35/35 (versión de entonces) |
| 5550c17 | Correcciones de la revisión 2 | PASS 13/13 | 39/39 |
| 9b6fc43 | Correcciones de la revisión 3 | PASS 13/13 | 52/52 |
| 20a29c9 | Correcciones de la revisión 4 | PASS 13/13 | 63/63 |
| 5e48ede | Correcciones de la revisión 5 | PASS 13/13 | 72/72 |
| **876146a** | Correcciones de la revisión 6 (definitivo de código) | **PASS 13/13** | **72/72** |

Antes de aff182e solo hubo ejecuciones con cambios sin commit. Sus evidencias se descartaron porque atribuían los
resultados al SHA 3710615 (el error de trazabilidad corregido en esta misión).

## Fallos encontrados y corregidos durante las pruebas (no ocultados)
- Primera CI completa: `31_db_supabase` FAIL por llaves locales de demostración en las evidencias → redacción en origen.
- Primera autoprueba: 9/9 "bloqueos" que eran **falsos positivos** (scripts ausentes en el worktree) → controles positivos y firmas.
- La autoprueba endurecida reveló: la regex `[^\n]*`, gitleaks roto en worktrees y la exploración de `ci-artifacts/`.
- Las rondas de revisión 1 a 6 (ver 04) encontraron 37 hallazgos distintos (20 + 3 + 2 + 4 + 5 + 3); todos se corrigieron o se justificaron.
- Durante M25 el orquestador ejecutó por error `git stash` mientras probaba resolve_base. Se detectó por la salida, se
  restauró con `git stash pop` y las tres pruebas afectadas se repitieron con la versión correcta.

## No verificado (requiere ejecutar el workflow en GitHub, es decir, push autorizado)
Instalación de `postgresql-16-pgtap` y `postgresql-16-cron` en ubuntu-24.04 · `supabase/setup-cli` con la 3.0.0 ·
gitleaks en Docker con el usuario del runner · que los nombres de los checks coincidan con los de la protección de ramas.
