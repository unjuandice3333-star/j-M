# Criterios de aceptación de la fábrica

## Criterios generales (toda misión)
- G1. `bash scripts/ci/run_all.sh` (perfil full) con veredicto PASS sobre el commit entregado. Si alguna compuerta queda BLOCKED por el entorno, se documenta y la misión **no** se declara terminada para esa compuerta.
- G2. Revisión independiente realizada. Los hallazgos bloqueantes y mayores están corregidos o justificados por escrito.
- G3. Documentación `MISION_NN/` (inspección, plan, resultados, evidencias) y FACTORY/ actualizados.
- G4. Commit(s) local(es) en Conventional Commits, sin secretos ni artefactos. Sin push, merge ni despliegues.
- G5. Ningún contacto con QA compartido ni con Production.

## M25 — CI, ramas y gobierno
| ID | Criterio | Verificación |
|---|---|---|
| A1 | Convenciones de ramas y commits documentadas y verificadas por la CI | CONTRIBUTING.md; `check_branch_name.sh`, `check_commits.sh` + autoprueba |
| A2 | Estructura de PR y reglas de integración | `.github/pull_request_template.md`, CONTRIBUTING §3, CODEOWNERS |
| A3 | Protección de `main`/`develop` especificada, lista para aplicar con autorización | `MISION_25/governance/` |
| A4 | Separación entre desarrollo y liberación | CONTRIBUTING §1 |
| B1 | Instalación reproducible | `pnpm install --frozen-lockfile` |
| B2–B5 | Lint, typecheck, unitarias, build | pasos 11–16 |
| B6 | Integración (webhook, edge, BD) | pasos 14, 15, 30, 31 |
| B7 | Validación de migraciones | paso 20 |
| B8 | Reconstrucción de la BD desde cero, determinista | pasos 30 y 31 (doble reconstrucción y comparación) |
| C1 | Evidencias: comandos, resultados, logs, informe, commit probado, estado del árbol, versiones | `REPORT.md`/`verdict.txt` (evidence_valid), artefactos de cada job, `MISION_25/evidencias/` |
| D1 | Rama o worktree aislado por agente; nadie sobrescribe a otro | AGENT_ROLES.md + `gate_selftest.sh` (worktree efímero) |
| D2 | Revisor independiente | revisión por subagente de contexto nuevo (MISION_25/04); todos los hallazgos atendidos |
| D4 | Agentes utilizables y delimitados | `MISION_25/evidencias/verificacion_agentes.md` (sesiones reales de Claude Code) |
| D3 | Los fallos bloquean la integración | `gate_selftest.sh`: 72 controles (16 positivos + 56 negativos con firma); `ci_gate.sh` falla ante skipped/failure/ausente |
| E1–E3 | Dev y QA separados, datos de prueba, secretos fuera del código | ENVIRONMENT_POLICY.md; gitleaks; redacción de evidencias |
| E4 | Production inaccesible | Política + la CI rechaza operaciones remotas; sin secretos en el workflow |
