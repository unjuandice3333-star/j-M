#!/usr/bin/env bash
# =============================================================================
# CI — J&M FASHION STORE (M25). Único punto de entrada de las compuertas, en local y en GitHub Actions.
#
#   CI_PROFILE=full  (por defecto) | quick (omite las etapas de BD: SKIPPED, veredicto "PASS PARCIAL")
#   CI_STAGES="governance quality e2e-synthetic security db-local db-supabase"  (subconjunto; cada job de GitHub ejecuta una)
#   La etapa quality incluye las guardas de entorno de M26 (17_env_tests, 18_env_templates, 19_env_cli_checks,
#   19b_qa_profile_tests).
#   BASE_REF=<rama|commit>   base para commits y migraciones (por defecto origin/develop u origin/main)
#   PR_TITLE, TARGET_BRANCH  (opcionales, en PRs: título del squash y rama destino)
#   REQUIRE_CLEAN=1          falla si el árbol de trabajo tiene cambios sin commit
#
# Trazabilidad: el informe registra SHA, rama, estado del árbol de trabajo y, si hay cambios sin commit,
# su lista y diff (worktree_status.txt, worktree_diff.patch). Un resultado obtenido con el árbol sucio
# NUNCA se atribuye al SHA: el veredicto lo indica y evidence_valid=no.
# =============================================================================
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/lib/common.sh"
cd "$CI_ROOT"
PROFILE="${CI_PROFILE:-full}"
STAGES=" ${CI_STAGES:-governance quality e2e-synthetic security db-local db-supabase} "
want() { [[ "$STAGES" == *" $1 "* ]]; }
STAGES_TXT=$(echo $STAGES)
# En GitHub Actions la base la fija resolve_base.sh y es obligatoria: sin ella no se recurre a ninguna rama
# por defecto (evita validar contra una base distinta de la del evento).
if [[ -z "${BASE_REF:-}" && "${GITHUB_ACTIONS:-}" != true ]]; then
  for r in origin/develop origin/main; do git rev-parse -q --verify "$r" >/dev/null && { BASE_REF=$r; break; }; done
fi
BASE_REF="${BASE_REF:-}"
rm -f "$CI_OUT/results.tsv"; printf 'step\tstatus\texit_code\tseconds\tcommand\n' > "$CI_OUT/results.tsv"
rm -rf "${CI_OUT:?}/logs"; mkdir -p "$CI_OUT/logs"

# --- Trazabilidad del código probado (antes de ejecutar nada) ----------------------
SHA=$(git rev-parse HEAD); BRANCH=$(git rev-parse --abbrev-ref HEAD)
git status --porcelain=v1 --untracked-files=all | grep -vE '^\?\? ci-artifacts/' > "$CI_OUT/worktree_status.txt" || true
DIRTY=$(wc -l < "$CI_OUT/worktree_status.txt" | tr -d ' ')
if [[ "$DIRTY" -gt 0 ]]; then
  TREE="SUCIO ($DIRTY rutas con cambios sin commit)"; EVIDENCE_VALID=no
  git diff HEAD --stat > "$CI_OUT/worktree_diff.stat"; git diff HEAD > "$CI_OUT/worktree_diff.patch"
else
  TREE="LIMPIO"; EVIDENCE_VALID=yes; rm -f "$CI_OUT/worktree_diff.stat" "$CI_OUT/worktree_diff.patch"
fi
echo "== CI J&M · perfil=$PROFILE · etapas=[$STAGES_TXT] · commit=${SHA:0:12} · rama=$BRANCH · árbol=$TREE · base=${BASE_REF:-ninguna}"
if [[ "${REQUIRE_CLEAN:-0}" == 1 && "$DIRTY" -gt 0 ]]; then record_fail 00_clean_tree "REQUIRE_CLEAN=1 y el árbol tiene $DIRTY cambios"; fi

# --- Gobierno ---------------------------------------------------------------------
if want governance; then
  run_step 01_branch_name bash scripts/ci/check_branch_name.sh "${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-$BRANCH}}" "${TARGET_BRANCH:-}"
  if [[ -n "$BASE_REF" ]] && MB=$(git merge-base HEAD "$BASE_REF" 2>/dev/null); then
    run_step 02_commit_messages env PR_TITLE="${PR_TITLE:-}" bash scripts/ci/check_commits.sh "$MB" HEAD
  else record_fail 02_commit_messages "base '$BASE_REF' no resoluble"; fi
  # M26-R1 (MAJ-5): hacia main (o en main) exige la confirmación del propietario de que Production tiene las variables
  # que el código exige; en cualquier otra rama, que la declaración esté sincronizada con el código.
  if [[ "${TARGET_BRANCH:-}" == main || "${GITHUB_REF_NAME:-$BRANCH}" == main ]]; then RM=main; else RM=validate; fi
  run_step 03_production_readiness node scripts/release/production_readiness.mjs "$RM"
fi

# --- Calidad ----------------------------------------------------------------------
if want quality; then
  run_step 10_install       pnpm install --frozen-lockfile
  run_step 11_lint          npx --no-install eslint .
  run_step 12_typecheck     npx --no-install tsc -p tsconfig.ci.json
  # M34: incluye las pruebas unitarias de la tienda (apps/web/src/__tests__) además de packages (vitest.config.js)
  run_step 13_unit_tests    npx --no-install vitest run
  run_step 14_webhook_tests node --experimental-test-module-mocks apps/web/scripts/test-webhook-security.mjs
  if have "${DENO_BIN:-deno}"; then run_step 15_edge_tests bash scripts/ci/edge_tests.sh
  else record_blocked 15_edge_tests "deno no disponible (DENO_BIN)"; fi
  run_step 16_build         bash scripts/ci/build.sh
  # M26-T7: guardas de entorno (T1–T6). Entorno limpio (solo PATH/HOME/LANG): no dependen de variables de la máquina.
  run_step 17_env_tests      env -i PATH="$PATH" HOME="$HOME" LANG=C.UTF-8 pnpm -s test:env
  run_step 18_env_templates  env -i PATH="$PATH" HOME="$HOME" LANG=C.UTF-8 pnpm -s check:templates
  run_step 19_env_cli_checks env -i PATH="$PATH" HOME="$HOME" LANG=C.UTF-8 node scripts/env/ci_env_checks.mjs
  # M26-T8: comandos del perfil QA (build/preview/dev con Vite real y fixtures ficticios). Secuencial y fuera de test:env:
  # usa puertos fijos (4174, 3100) y comprueba el aislamiento frente a apps/web/.env.local.
  # M35: tope de 8 min (kill a los 10 s más): un cuelgue intermitente de los servidores de Vite debe FALLAR con log, no agotar el job
  run_step 19b_qa_profile_tests timeout --kill-after=10 480 env -i PATH="$PATH" HOME="$HOME" LANG=C.UTF-8 pnpm -s test:qa-build
fi

# --- E2E de navegador SINTÉTICO (M34) ----------------------------------------------
# Vite + Chromium reales contra un backend sintético en memoria (apps/web/e2e/synthetic). NO valida RLS, la BD real ni
# Wompi: eso lo cubren db-local/db-supabase. Requiere Chromium (el job lo instala con `playwright install`).
if want e2e-synthetic; then
  run_step 10_install      pnpm install --frozen-lockfile
  run_step 40_e2e_synthetic env -i PATH="$PATH" HOME="$HOME" LANG=C.UTF-8 PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}" node apps/web/e2e/e2e_synthetic.cjs
  # M36: smoke de Playwright (Chromium, backend sintético local; Edge es el navegador del propietario en Windows y no está en el runner)
  run_step 41_playwright_smoke env -i PATH="$PATH" HOME="$HOME" LANG=C.UTF-8 CI=1 PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}" node apps/web/scripts/pw.mjs local --project=chromium
fi

# --- Seguridad y migraciones -----------------------------------------------------
if want security; then
  if [[ -n "$BASE_REF" ]]; then BASE_REF="$BASE_REF" run_step 20_migrations_policy bash scripts/ci/migrations_policy.sh
  else record_fail 20_migrations_policy "sin BASE_REF"; fi
  if have gitleaks || docker info >/dev/null 2>&1; then run_step 21_secrets_scan bash scripts/ci/secrets_scan.sh
  else record_blocked 21_secrets_scan "ni gitleaks ni Docker disponibles"; fi
fi

# --- Base de datos ----------------------------------------------------------------
for st in db-local db-supabase; do
  want "$st" || continue
  name=$([[ $st == db-local ]] && echo 30_db_local_pg16 || echo 31_db_supabase)
  if [[ "$PROFILE" == quick ]]; then record_skipped "$name" "perfil quick"; continue; fi
  if [[ $st == db-local ]]; then
    if [[ "$(id -u)" -ne 0 ]]; then run_step "$name" bash scripts/ci/db_local.sh
    elif id postgres >/dev/null 2>&1; then
      run_step "$name" su postgres -s /bin/bash -c "WORKDIR=/tmp/jm_ci_pg_\$\$ bash '$CI_ROOT/scripts/ci/db_local.sh'"
    else record_blocked "$name" "se requiere usuario no root para initdb"; fi
  else
    if docker info >/dev/null 2>&1 && have "${SUPABASE_BIN:-supabase}"; then run_step "$name" bash scripts/ci/db_supabase.sh
    else record_blocked "$name" "Docker o Supabase CLI no disponibles"; fi
  fi
done

# --- Versiones (después de instalar dependencias) ---------------------------------
bash "$HERE/env_report.sh" > "$CI_OUT/logs/99_environment.log" 2>&1

# --- Informe ----------------------------------------------------------------------
fails=$(awk -F'\t' 'NR>1 && ($2=="FAIL" || $2=="BLOCKED")' "$RESULTS_TSV" | wc -l | tr -d ' ')
skips=$(awk -F'\t' 'NR>1 && $2=="SKIPPED"' "$RESULTS_TSV" | wc -l | tr -d ' ')
if   [[ $fails -gt 0 ]]; then verdict=FAIL
elif [[ $skips -gt 0 ]]; then verdict="PASS PARCIAL ($skips compuertas SKIPPED)"
else verdict=PASS; fi
[[ "$EVIDENCE_VALID" == no && $fails -eq 0 ]] && verdict="$verdict — ÁRBOL SUCIO: no es evidencia del commit ${SHA:0:12}"
{
  echo "# Informe de CI — J&M FASHION STORE"
  echo
  echo "- **Veredicto:** $verdict"
  echo "- **Perfil / etapas:** \`$PROFILE\` / \`$STAGES_TXT\`"
  echo "- **Commit (HEAD):** \`$SHA\` · **Rama:** \`$BRANCH\`"
  echo "- **Árbol de trabajo:** $TREE · **evidence_valid:** $EVIDENCE_VALID"
  [[ "$DIRTY" -gt 0 ]] && echo "- **Código probado = HEAD + cambios sin commit** (ver \`worktree_status.txt\`, \`worktree_diff.stat\`, \`worktree_diff.patch\`)"
  echo "- **Base:** \`${BASE_REF:-ninguna}\`$( [[ -n "$BASE_REF" ]] && echo " (merge-base \`$(git merge-base HEAD "$BASE_REF" 2>/dev/null || echo ?)\`)")"
  echo "- **Fecha (UTC):** $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo "| Paso | Estado | Exit | Segundos | Comando |"
  echo "|---|---|---|---|---|"
  awk -F'\t' 'NR>1 {printf "| %s | %s | %s | %s | `%s` |\n", $1, $2, $3, $4, $5}' "$RESULTS_TSV"
  if [[ "$DIRTY" -gt 0 ]]; then echo; echo "## Cambios sin commit incluidos en la prueba"; echo '```'; cat "$CI_OUT/worktree_diff.stat"; grep '^??' "$CI_OUT/worktree_status.txt"; echo '```'; fi
  echo
  echo "## Entorno y versiones"
  echo '```'; cat "$CI_OUT/environment.txt" 2>/dev/null; echo '```'
  echo
  echo "Logs completos: \`logs/\`. Un paso BLOCKED cuenta como fallo; SKIPPED nunca cuenta como aprobado."
} > "$CI_OUT/REPORT.md"
printf 'verdict=%s\nsha=%s\nbranch=%s\ntree=%s\nevidence_valid=%s\nprofile=%s\nstages=%s\nbase_ref=%s\n' \
  "$verdict" "$SHA" "$BRANCH" "$TREE" "$EVIDENCE_VALID" "$PROFILE" "$STAGES_TXT" "${BASE_REF:-}" > "$CI_OUT/verdict.txt"
echo "== VEREDICTO: $verdict · informe: $CI_OUT/REPORT.md"
[[ $fails -eq 0 ]]
