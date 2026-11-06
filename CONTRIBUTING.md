# Contribuir a J&M FASHION STORE

Reglas de integración vigentes desde la Misión 25. Se aplican igual a personas y a agentes de la fábrica
(ver `FACTORY/AGENT_ROLES.md`). Toda regla marcada con **[CI]** la verifica una compuerta automática:
si falla, el cambio no se integra.

## 1. Ramas

| Rama | Propósito | Quién escribe | Se integra en |
|---|---|---|---|
| `main` | Código liberable. Protegida. | Solo merges de PR aprobados | — |
| `develop` | Integración continua de misiones terminadas. Protegida. | Solo merges de PR aprobados | `release/*` |
| `release/X.Y[.Z]` | Estabilización de una versión. Solo correcciones. | PR desde `fix/*` | `main` (+ back-merge a `develop`) |
| `hotfix/<slug>` | Corrección urgente sobre `main`. | Orquestador | `main` + `develop` |
| `mission/mNN-<slug>` | Rama de integración de una misión. | Orquestador | `develop` |
| `agent/<rol>/mNN-<slug>` | Trabajo aislado de un agente dentro de una misión. | Un único agente | `mission/mNN-<slug>` |
| `feat\|fix\|chore\|docs\|test\|refactor\|perf\|ci\|db/<slug>` | Cambios puntuales fuera de una misión. | Autor | `develop` |

- Formato y flujo **[CI]**: `scripts/ci/check_branch_name.sh <rama> [destino]`. Los `<slug>` van en minúsculas, con
  números y guiones. Las ramas `dependabot/*` y `renovate/*` de los bots de dependencias se aceptan.
- Flujo permitido **[CI en PR]**: a `main` solo `release/*` o `hotfix/*`; a `release/*` solo `fix/*` o `hotfix/*`;
  a `mission/*` solo `agent/*`.
- Roles válidos en `agent/<rol>/…`: `orchestrator, developer, qa, reviewer, backend, frontend, db, payments, e2e, docs`.
- Las ramas históricas `Principal`, `Director` y `qa/supabase-preview` no cumplen el formato. Quedan congeladas
  (solo lectura) y no reciben trabajo nuevo.
- **Separación entre desarrollo y liberación:** nada llega a `main` sin pasar por `develop` y `release/*`,
  salvo los `hotfix/*`. Ningún despliegue sale de una rama distinta de `main`. La fábrica no despliega
  (ver `FACTORY/ENVIRONMENT_POLICY.md`).

## 2. Commits

Formato [Conventional Commits](https://www.conventionalcommits.org/) **[CI]** (`scripts/ci/check_commits.sh`):

```
<tipo>(<ámbito opcional>)!: <descripción de 1 a 100 caracteres>
```

- Tipos: `feat, fix, docs, chore, test, refactor, perf, ci, build, db, style, revert`.
- Ámbito en minúsculas (`payments`, `db`, `checkout`, `m25`…). `!` marca un cambio incompatible.
- Los merges con el mensaje estándar de git se aceptan.
- **Título del PR [CI]:** también en Conventional Commits, porque es el mensaje del commit *squash*.
- **Archivos prohibidos [CI]:** `.env*` (salvo `.env.example`), `*.pem`, `*.p12`, `*.key`, `id_rsa*`, `id_ed25519*`, `supabase/.temp/`, `ci-artifacts/`.
- Si la base del rango no se puede resolver (por ejemplo, tras un force-push), la compuerta **falla** (exit 2). Nunca aprueba un rango vacío.
- Un commit = un cambio coherente que pasa la CI por sí solo.

## 3. Pull requests

- Use la plantilla `.github/pull_request_template.md`: misión, alcance, pruebas ejecutadas con su resultado,
  riesgos, migraciones y lista de verificación.
- Un PR por rama de agente o de misión. Que sea pequeño, con un solo propósito.
- **Revisión independiente obligatoria:** la aprobación no puede venir del autor ni del agente que escribió
  el código. Los cambios en `supabase/`, `.github/`, `scripts/ci/`, `apps/web/api/` y el código de pagos
  requieren además a los propietarios de `CODEOWNERS`.
  **[MANUAL — pendiente]:** hoy `CODEOWNERS` tiene una sola cuenta. Si los agentes publican con esa misma cuenta,
  GitHub no permite que se apruebe a sí misma. Hace falta una segunda cuenta humana o un bot revisor
  (decisión del propietario; ver `MISION_25/governance/README.md`).
- Un PR también puede modificar los scripts de las compuertas. Por eso el job `trusted-policy` ejecuta la política
  de migraciones de la **rama base** sobre el código del PR, y los cambios en `scripts/ci/` y `.github/` requieren
  la revisión de `CODEOWNERS`.
- Solo se integra un PR con la compuerta `ci-gate` en verde. Un paso `BLOCKED` o `SKIPPED` **no** cuenta
  como aprobado.
- Estrategia de merge: *squash* hacia `mission/*` y `develop`; *merge commit* de `release/*` a `main`,
  para conservar la trazabilidad de la versión.

## 4. Migraciones de base de datos **[CI]** (`scripts/ci/migrations_policy.sh`)

1. Nombre `AAAAMMDDHHMMSS_descripcion.sql`, con versión única.
2. Las migraciones existentes son inmutables: no se editan, borran ni renombran. Toda corrección va en una migración nueva.
3. Una migración nueva lleva una versión posterior a la última existente.
4. `supabase/migrations_legacy/` es histórico y es inmutable.
5. Ningún archivo ejecutable (`*.sh`, `*.mjs`, `*.py`, `*.yml`, `*.toml`, `package.json`, `.husky/*`) puede contener
   operaciones o destinos remotos: `supabase link|login|db push|pull|dump|functions deploy|secrets set|migration repair`,
   `--linked|--remote|--db-url|--project-ref`, la misma operación invocada mediante una variable, URLs `*.supabase.co`
   o del pooler, ni `vercel deploy|env|link`. Los workflows no pueden usar `secrets.*`, `environment:` ni permisos de escritura.
   La comparación se hace contra el **árbol de trabajo**, así que también cubre los cambios sin commit.
6. Toda migración debe reconstruir la BD desde cero de forma determinista, con un mínimo de 290 pruebas pgTAP
   ejecutadas y aprobadas **[CI: `MIN_TESTS`]**, tanto en PostgreSQL 16 local como en el stack oficial de Supabase local.

## 5. Secretos

- Nunca en el código, en los commits, en los logs ni en las evidencias **[CI]** (gitleaks sobre el historial y
  el árbol de trabajo, y verificación del bundle del navegador).
- Las llaves de demostración del stack local de Supabase se redactan antes de escribir evidencias.
- La fábrica **no** solicita, guarda ni usa credenciales de Production.

## 6. Ejecutar la CI localmente

```bash
pnpm install --frozen-lockfile
bash scripts/ci/run_all.sh                                   # perfil completo (PostgreSQL 16, Docker y Supabase CLI)
REQUIRE_CLEAN=1 BASE_REF=origin/develop bash scripts/ci/run_all.sh   # evidencia válida: exige árbol limpio
CI_PROFILE=quick bash scripts/ci/run_all.sh                  # sin BD → veredicto "PASS PARCIAL", nunca PASS
CI_STAGES="governance security" bash scripts/ci/run_all.sh   # solo algunas etapas (así lo usa cada job de GitHub)
bash scripts/ci/gate_selftest.sh                             # 39 controles: cada compuerta pasa limpia y bloquea su defecto
```

El informe `ci-artifacts/REPORT.md` (más `verdict.txt`, `results.tsv`, `environment.txt` y `logs/`) registra el SHA,
la rama, el **estado del árbol de trabajo** y, si hay cambios sin commit, su lista y su diff. Una ejecución con el
árbol sucio **nunca** se presenta como evidencia del SHA (`evidence_valid=no`).
GitHub Actions (`.github/workflows/ci.yml`) ejecuta `run_all.sh` en cada job (una etapa por job) y sube el mismo
informe como artefacto.

## 7. Qué se verifica automáticamente y qué no

| Norma | Control |
|---|---|
| Nombres de rama y flujo de integración | Automático (governance) |
| Conventional Commits, título del PR, archivos prohibidos | Automático (governance) |
| Lint, tipos, unitarias, webhook, edge, build, bundle sin secretos | Automático (quality) |
| Migraciones inmutables, sin operaciones remotas, workflows sin secretos | Automático (security + trusted-policy) |
| Reconstrucción determinista, ≥290 pruebas pgTAP, 39 verificaciones HTTP | Automático (db-local, db-supabase) |
| Todas las compuertas en success | Automático (ci-gate), **efectivo solo cuando se aplique la protección de ramas** |
| "Todo cambio trae pruebas" | **Manual**: lo exige el revisor (plantilla de PR) |
| Revisor distinto del autor | **Manual / plataforma**: GitHub lo impone con la protección de ramas y una segunda cuenta |
| Aislamiento por worktree y no sobrescribir a otro agente | **Proceso** (orquestador) + permisos de Claude Code; no es un control de la CI |
| Solo lectura de qa/reviewer | **Parcial**: sin Edit/Write, pero con Bash (ver `MISION_25/evidencias/verificacion_agentes.md`) |
