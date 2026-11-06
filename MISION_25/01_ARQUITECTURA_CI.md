# M25 — Arquitectura de CI

## Principio
Un único punto de entrada, `scripts/ci/run_all.sh`, ejecuta las compuertas en local y en GitHub Actions. Cada job del
workflow ejecuta `run_all.sh` con una etapa (`CI_STAGES`) y sube el mismo informe. No hay lógica duplicada en YAML.

```
.github/workflows/ci.yml
 ├─ governance      → run_all.sh [governance]   01 rama+flujo · 02 commits+título PR+archivos prohibidos
 ├─ quality         → run_all.sh [quality]      10 install --frozen-lockfile · 11 lint · 12 typecheck · 13 unit
 │                                              14 webhook · 15 edge (Deno) · 16 build + bundle sin secretos
 ├─ security        → run_all.sh [security]     20 política de migraciones/remotos · 21 gitleaks (historial + árbol)
 ├─ trusted-policy  → política de la RAMA BASE aplicada al PR (solo pull_request)
 ├─ db-local        → run_all.sh [db-local]     30 PG16: reconstrucción + ≥290 pgTAP + concurrencia + determinismo
 ├─ db-supabase     → run_all.sh [db-supabase]  31 stack oficial: start→reset→test db (≥290)→39 HTTP→stop→start→reset→determinismo 7/7
 └─ ci-gate         → ci_gate.sh: todos los jobs requeridos en success (skipped/failure/ausente → falla)
```

## Componentes
| Script | Función | Garantías ante fallos |
|---|---|---|
| `run_all.sh` | Orquesta etapas, registra pasos, genera REPORT.md/verdict.txt | BLOCKED = fallo; SKIPPED → "PASS PARCIAL"; árbol sucio → `evidence_valid=no`; `REQUIRE_CLEAN=1` |
| `lib/common.sh` | `run_step`, `record_blocked`, `record_fail`, `record_skipped` | Log por paso con comando, commit, inicio/fin y código de salida |
| `resolve_base.sh` | Base de comparación por evento | Nunca HEAD~1; sin base → exit 2 |
| `check_branch_name.sh` | Formato y flujo de integración | — |
| `check_commits.sh` | Conventional Commits, título del PR, archivos prohibidos | Base/head desconocidos → exit 2 |
| `migrations_policy.sh` | Reglas 1-6 contra el árbol de trabajo; `POLICY_ROOT` para la copia confiable | Base desconocida → exit 2; excepción M24B ligada a un SHA |
| `build.sh` | Build + nombres de secretos + JWT privilegiados + gitleaks sobre dist | — |
| `secrets_scan.sh`, `lib/gitleaks.sh` | gitleaks fijado por digest, compatible con worktrees | Sin gitleaks ni Docker → BLOCKED |
| `db_local.sh` | PG16 local (delegado a `supabase/tests/run_local.sh`) | Mínimo `MIN_TESTS=290` |
| `db_supabase.sh` | Stack oficial local, doble reconstrucción, HTTP | Aborta si hay un proyecto enlazado o un token; `$OUT` limpio; redacción de llaves y verificación final; mínimo 290 |
| `ci_gate.sh` | Agregación de jobs | Probado con skipped/ausente |
| `gate_selftest.sh` | 72 controles positivos y negativos en un worktree efímero | Firma de error esperada; detecta "bloqueos" por script ausente |

## Evidencias por ejecución
`ci-artifacts/`: `REPORT.md`, `verdict.txt` (veredicto, sha, rama, árbol, evidence_valid, perfil, etapas, base),
`results.tsv`, `environment.txt` (versiones), `worktree_status.txt` y `worktree_diff.{stat,patch}` si el árbol está sucio,
`logs/NN_*.log`, `db_supabase/` (logs redactados, resultados HTTP, instantáneas), `db_local/`, `gitleaks_*.json` (redactados).

## Seguridad del workflow
`permissions: contents: read`; ningún `secrets.*` ni `environment:` (la regla 6 lo verifica); acciones fijadas por SHA;
la imagen de gitleaks fijada por digest; las entradas del evento se pasan por variables de entorno (sin interpolarlas en
scripts); la BD solo se levanta en contenedores efímeros del runner.
