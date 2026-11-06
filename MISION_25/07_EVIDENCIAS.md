# M25 — Evidencias

Todas las evidencias se generaron con el **árbol limpio** (`REQUIRE_CLEAN=1`, `evidence_valid=yes`) sobre el commit indicado,
con base `origin/main` (2661f2a): cubre los commits M24 y M25 y la excepción M24B.
Cada carpeta incluye `SHA256SUMS`, verificable con `sha256sum -c SHA256SUMS`.

| Carpeta | Commit | Contenido |
|---|---|---|
| `evidencias/final_876146a/` | **876146a (definitivo de código)** | `run_all.log`, `ci/` (copia de `ci-artifacts/`: REPORT.md, verdict.txt, results.tsv, environment.txt, logs/ por paso, db_supabase/ con logs redactados, resultados HTTP y checksums de las instantáneas A/B, db_local/, gitleaks_*.json), `gate_selftest.log`, `actionlint.log`, `exit_codes.txt`, estado del árbol antes y después, `worktrees_after.txt` |
| `evidencias/historico/ci_full_<sha>/` | aff182e, 5550c17, 9b6fc43, 20a29c9, 5e48ede | CI completa de cada commit intermedio (todas PASS), conservada para la trazabilidad de las rondas de revisión |
| `evidencias/agentes/` | 5550c17 (árbol con cambios de la ronda 2) | JSON original de `claude -p --agent …`: herramientas efectivas y denegaciones de permisos |
| `evidencias/verificacion_agentes.md` | — | Análisis de las pruebas de agentes y sus limitaciones |

Las instantáneas completas del esquema (`schema.sql`, etc.) no se versionan: se conservan sus checksums (7 archivos por
instantánea), que son lo que compara la prueba de determinismo.

Fuera del repositorio (entregado al propietario): bundle git de la rama con historia completa y su SHA-256, y la
evidencia de la CI ejecutada sobre el commit de documentación final (que no puede contenerse a sí misma).
