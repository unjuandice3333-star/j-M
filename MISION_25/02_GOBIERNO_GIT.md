# M25 — Gobierno de Git

Documento normativo: `CONTRIBUTING.md` (raíz). Resumen:

| Tema | Regla | Control |
|---|---|---|
| Ramas | `main`, `develop`, `release/X.Y[.Z]`, `hotfix/*`, `mission/mNN-*`, `agent/<rol>/mNN-*`, `<tipo>/*`, bots | `check_branch_name.sh` |
| Flujo | main ← release/hotfix · release ← fix/hotfix · mission ← agent · develop ← mission/tipo | `check_branch_name.sh <rama> <destino>` en PR |
| Desarrollo / liberación | Nada llega a main sin pasar por develop y release (salvo hotfix); la fábrica no despliega | Flujo + ENVIRONMENT_POLICY |
| Commits | Conventional Commits; título del PR también | `check_commits.sh` |
| Archivos prohibidos | `.env*`, llaves, `supabase/.temp/`, `ci-artifacts/` | `check_commits.sh` + gitleaks |
| PR | Plantilla `.github/pull_request_template.md`; revisor ≠ autor; CODEOWNERS en zonas críticas | Plantilla + CODEOWNERS + protección (pendiente de aplicar) |
| Integración | Solo con `ci-gate` en success; squash a mission/develop; merge commit de release a main | Protección de ramas (especificada) |
| Protección de main/develop | PR obligatorio, `ci-gate` estricto, CODEOWNERS, aprobación del último push, sin force-push ni borrado | `governance/branch-protection.*.json` — **NO aplicada** |

Ramas existentes: `main` (remota), `Principal` y `Director` (históricas, no cumplen el formato, congeladas por política),
`db/baseline-m24b` (M24, local) y `mission/m25-ci-governance` (M25, local). Ninguna se publicó.

Decisiones pendientes del propietario: ver `governance/README.md` (crear `develop`, una segunda identidad revisora,
aplicar la protección, destino de las ramas históricas).
