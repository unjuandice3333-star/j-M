#!/usr/bin/env bash
# =============================================================================
# Autoprueba de compuertas (M25): demuestra que cada compuerta PASA sobre el árbol limpio (control
# positivo) y FALLA ante un defecto real (control negativo), con la firma de error esperada.
# Trabaja en un git worktree temporal (rama efímera ci-selftest/<pid>) con una instalación real de
# dependencias; el repositorio principal no se modifica. Los fixtures que parecen secretos u operaciones
# remotas se componen en tiempo de ejecución para que este archivo no dispare las propias compuertas.
# No cubre las etapas de BD (lentas; tienen sus propias aserciones: mínimo de pruebas, determinismo).
# Salida: exit 0 solo si todos los controles se comportan como se espera.
# =============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WT="$(mktemp -d /tmp/jm-gate-selftest.XXXXXX)"
BR="ci-selftest/$$"
LOG="$WT.log"
cleanup() { git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1; git -C "$ROOT" branch -D "$BR" >/dev/null 2>&1; rm -f "$LOG" "$WT.install.log"; }
trap cleanup EXIT
git -C "$ROOT" worktree add -q -b "$BR" "$WT" HEAD
# Árbol de trabajo actual (cambios sin commit incluidos, borrados aplicados) → commit base efímero.
( cd "$ROOT" && git ls-files -mo --exclude-standard -z | while IFS= read -r -d '' f; do [[ -e "$f" ]] && printf '%s\0' "$f"; done \
  | tar --null -cf - -T - ) | tar -C "$WT" -xf -
( cd "$ROOT" && git ls-files -d -z ) | ( cd "$WT" && xargs -0 -r rm -f )
git -C "$WT" add -A && git -C "$WT" -c user.name=selftest -c user.email=selftest@local commit -qm "test: selftest baseline" --allow-empty
cd "$WT"
CI=true pnpm install --frozen-lockfile --prefer-offline > "$WT.install.log" 2>&1 || { echo "ERROR: pnpm install en el worktree"; tail -5 "$WT.install.log"; exit 2; }
G() { git -c user.name=selftest -c user.email=selftest@local "$@"; }

ok=0; total=0
expect_fail() {   # <descripción> <firma-regex> <comando...>
  local desc="$1" sig="$2"; shift 2; total=$((total + 1))
  local rc; "$@" > "$LOG" 2>&1; rc=$?
  if [[ $rc -eq 0 ]]; then echo "[NO BLOQUEÓ] $desc"; tail -3 "$LOG" | sed 's/^/    /'
  elif [[ $rc -eq 126 || $rc -eq 127 ]]; then echo "[INVÁLIDO]   $desc (comando no ejecutable, rc=$rc)"
  elif ! grep -qiE "$sig" "$LOG"; then echo "[INVÁLIDO]   $desc (falló sin la firma esperada: $sig)"; tail -3 "$LOG" | sed 's/^/    /'
  else echo "[BLOQUEÓ]    $desc"; ok=$((ok + 1)); fi
}
expect_pass() {   # <descripción> <comando...>
  local desc="$1"; shift; total=$((total + 1))
  if "$@" > "$LOG" 2>&1; then echo "[PASA LIMPIO] $desc"; ok=$((ok + 1)); else echo "[FALLA LIMPIO] $desc"; tail -5 "$LOG" | sed 's/^/    /'; fi
}
reset_tree() { git reset -q --hard HEAD && git clean -qfd -e node_modules -e dist; }
ALL_OK='{"governance":{"result":"success"},"quality":{"result":"success"},"security":{"result":"success"},"db-local":{"result":"success"},"db-supabase":{"result":"success"}}'
ONE_SKIPPED='{"governance":{"result":"success"},"quality":{"result":"success"},"security":{"result":"success"},"db-local":{"result":"success"},"db-supabase":{"result":"skipped"}}'
git update-ref refs/remotes/origin/selftest-default HEAD~1 2>/dev/null || git update-ref refs/remotes/origin/selftest-default HEAD

echo "-- controles positivos (árbol sin defectos)"
expect_pass "lint"                 npx --no-install eslint .
expect_pass "typecheck"            npx --no-install tsc -p tsconfig.ci.json
expect_pass "unit"                 npx --no-install vitest run --dir packages
expect_pass "webhook"              node --experimental-test-module-mocks apps/web/scripts/test-webhook-security.mjs
expect_pass "build"                bash scripts/ci/build.sh
expect_pass "migraciones"          env BASE_REF=HEAD bash scripts/ci/migrations_policy.sh
expect_pass "secretos"             bash scripts/ci/secrets_scan.sh
expect_pass "commits"              bash scripts/ci/check_commits.sh HEAD~1 HEAD
expect_pass "rama + flujo"         bash scripts/ci/check_branch_name.sh agent/qa/m25-x mission/m25-x
expect_pass "ci-gate (todo success)" env NEEDS_JSON="$ALL_OK" bash scripts/ci/ci_gate.sh
expect_pass "resolve_base: rama nueva (before=000…) → merge-base con la rama por defecto" \
            env EVENT_NAME=push PUSH_BEFORE=0000000000000000000000000000000000000000 DEFAULT_BRANCH=selftest-default bash scripts/ci/resolve_base.sh
expect_pass "resolve_base: dispatch sin commits nuevos (base == HEAD) se acepta con aviso" \
            env EVENT_NAME=workflow_dispatch DEFAULT_BRANCH=selftest-head bash -c 'git update-ref refs/remotes/origin/selftest-head HEAD && bash scripts/ci/resolve_base.sh; rc=$?; git update-ref -d refs/remotes/origin/selftest-head; exit $rc'
expect_pass "resolve_base: push con avance rápido → before" env EVENT_NAME=push PUSH_BEFORE=HEAD~1 bash scripts/ci/resolve_base.sh

echo "-- controles negativos (defecto inyectado)"
echo 'export const roto = () => variableNoDefinida + 1;' > apps/web/src/__selftest_lint.js
expect_fail "lint: error no-undef" "no-undef" npx --no-install eslint apps/web/src/__selftest_lint.js
reset_tree

echo 'export const n: number = "texto";' >> packages/utils/index.ts
expect_fail "typecheck: error de tipos" "TS2322" npx --no-install tsc -p tsconfig.ci.json
reset_tree

sed -i "s/toBe('POLOCLASS01-M-NEG')/toBe('VALOR-INCORRECTO')/" packages/utils/index.test.ts
expect_fail "unit: regresión" "VALOR-INCORRECTO|failed" npx --no-install vitest run --dir packages
reset_tree

echo 'console.log("SUPABASE_SERVICE_ROLE_KEY");' >> apps/web/src/main.jsx
expect_fail "build: nombre de secreto de servidor en el bundle" "contiene referencias a secretos" bash scripts/ci/build.sh
reset_tree

JWT=$(python3 -c "import base64,json;e=lambda d:base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=');print(e({'alg':'HS256','typ':'JWT'})+'.'+e({'iss':'supabase-demo','role':'service'+'_role','exp':1983812996})+'.'+'x'*43)")
echo "console.log(\"$JWT\");" >> apps/web/src/main.jsx
expect_fail "build: VALOR de un JWT service_role en el bundle" "role=service_role|gitleaks detectó" bash scripts/ci/build.sh
reset_tree

echo '-- cambio no permitido' >> supabase/migrations/20261106120000_baseline_ecommerce.sql
G commit -qam "test: edit existing migration"
expect_fail "migraciones: edición de una migración existente (commit)" "baseline_ecommerce" env BASE_REF=HEAD~1 bash scripts/ci/migrations_policy.sh
git reset -q --hard HEAD~1

echo '-- cambio no permitido' >> supabase/migrations/20261106120000_baseline_ecommerce.sql
expect_fail "migraciones: edición SIN commit (árbol de trabajo)" "baseline_ecommerce" env BASE_REF=HEAD bash scripts/ci/migrations_policy.sh
reset_tree

f=$(git ls-files supabase/migrations_legacy | grep '\.sql$' | head -1); echo '-- x' >> "$f"
expect_fail "migraciones: edición de migrations_legacy" "migrations_legacy/ es inmutable" env BASE_REF=HEAD bash scripts/ci/migrations_policy.sh
reset_tree

echo 'select 1;' > supabase/migrations/20200101000000_vieja.sql
expect_fail "migraciones: versión nueva anterior a la última" "versión <= última" env BASE_REF=HEAD bash scripts/ci/migrations_policy.sh
reset_tree

expect_fail "migraciones: base inexistente no se aprueba" "ERROR FATAL" env BASE_REF=no-existe-esta-ref bash scripts/ci/migrations_policy.sh

printf 'npx supa%s functions dep%s --project-re%s abc\n' base loy f > scripts/ci/__selftest_remote.sh
expect_fail "regla 6: operación remota de Supabase en un script" "__selftest_remote" env BASE_REF=HEAD bash scripts/ci/migrations_policy.sh
reset_tree

printf 'SB=supabase\n$SB li%s\n' nk > scripts/ci/__selftest_indirect.sh
expect_fail "regla 6: operación remota invocada mediante una variable" "__selftest_indirect" env BASE_REF=HEAD bash scripts/ci/migrations_policy.sh
reset_tree

printf 'SB=supabase\n"$SB" li%s\n' nk > scripts/ci/__selftest_quoted.sh
expect_fail "regla 6: variable entre comillas" "__selftest_quoted" env BASE_REF=HEAD bash scripts/ci/migrations_policy.sh
reset_tree

printf 'CLI=supa%s; ${CLI} db pu%s\n' base sh > scripts/ci/__selftest_cli.sh
expect_fail "regla 6: variable con otro nombre" "__selftest_cli" env BASE_REF=HEAD bash scripts/ci/migrations_policy.sh
reset_tree

expect_r6() {   # <descripción> <archivo> <contenido printf> [args...]
  local desc="$1" file="$2" fmt="$3"; shift 3
  mkdir -p "$(dirname "$file")"; printf "$fmt" "$@" > "$file"
  expect_fail "regla 6: $desc" "$(basename "$file")" env BASE_REF=HEAD bash scripts/ci/migrations_policy.sh
  reset_tree
}
expect_r6 "bandera global entre la variable y el subcomando" scripts/ci/__st_flag.sh 'SB=supabase\n"$SB" --workdir . db pu%s\n' sh
expect_r6 "espacios múltiples" scripts/ci/__st_spaces.sh 'supa%s db   pu%s\n' base sh
expect_r6 "arreglo bash" scripts/ci/__st_array.sh 'c=(supa%s); "${c[@]}" li%s\n' base nk
expect_r6 "lista de Python (subprocess)" scripts/ci/__st_sub.py 'import subprocess\nsubprocess.run(["supa%s", "db", "pu%s"])\n' base sh
expect_r6 "workflow con extensión .YML" .github/workflows/__st_upper.YML 'on: push\npermissions: write-%s\n' all
expect_r6 "permiso de escritura entre comillas" .github/workflows/__st_quoted.yml 'on: push\npermissions:\n  actions: "wri%s"\n' te
expect_r6 "permisos en estilo flujo" .github/workflows/__st_flow.yml "on: push\npermissions: { pull-requests: 'wri%s' }\n" te
expect_r6 "workflow sin bloque permissions" .github/workflows/__st_noperm.yml 'on: push\njobs: {}\n%s' ''
expect_r6 "workflow que usa el token" .github/workflows/__st_token.yml 'on: issue_comment\npermissions:\n  contents: read\njobs:\n  x:\n    steps:\n      - run: echo ${{ github.tok%s }}\n' en
expect_r6 "envío de config.toml al proyecto" scripts/ci/__st_cfg.sh 'supa%s config pu%s\n' base sh
expect_r6 "eliminación de un proyecto" scripts/ci/__st_proj.sh 'npx supa%s projects dele%s abcdefghijklmnopqrst\n' base te
expect_r6 "creación de una rama de preview" scripts/ci/__st_br.sh 'supa%s branches crea%s preview\n' base te
expect_r6 "bandera de id de proyecto" scripts/ci/__st_pid.sh 'supa%s gen types typescript --project-i%s x > t.ts\n' base d
expect_r6 "API de gestión de Supabase" scripts/ci/__st_api.sh 'curl -s https://api.supa%s.com/v1/projects/$REF/database/query\n' base
expect_r6 "CLI de Vercel sin subcomando (despliega)" scripts/ci/__st_vc.sh 'npx verc%s --yes\n' el
expect_r6 "host de proyecto interpolado" scripts/ci/__st_host.mjs 'fetch(`https://${ref}.supa%s.co/rest/v1/x`)\n' base
expect_r6 "spawn con link" scripts/ci/__st_spawn.mjs 'spawn("supa%s", ["li%s", "--x", ref])\n' base nk

expect_r6 "listado de migraciones del proyecto" scripts/ci/__st_ml.sh 'supa%s migration li%s\n' base st
expect_r6 "escritura en Storage remoto" scripts/ci/__st_st.sh 'supa%s storage c%s ./x ss:///b/x --experimental\n' base p
expect_r6 "inspección de la BD remota" scripts/ci/__st_in.sh 'supa%s inspect d%s bloat\n' base b
expect_r6 "descarga de una función" scripts/ci/__st_fd.sh 'supa%s functions downlo%s wompi-webhook\n' base ad
expect_r6 "secretos del proyecto vía sbr" scripts/ci/__st_sl.sh 'sbr "$OUT/x.log" secre%s list\n' ts
expect_r6 "despliegue de Vercel mediante variable" scripts/ci/__st_vv.sh 'cmd=verc%s; $cmd depl%s --prod\n' el oy
expect_r6 "script de package.json que despliega" apps/web/__st/package.json '{"scripts": {"deploy": "verc%s --prod"}}\n' el

# Código legítimo que NO debe disparar la regla 6 (falsos positivos detectados en la revisión)
printf 'res.redirect(`${origin}/login`);\nif (["login", "logout"].includes(action)) {}\nconst u = "https://mock.supabase.co";\nconst platform = process.env.VERCEL ? %s : %s;\nif (req.headers["user-agent"] === %s) {}\nconsole.log("secrets list loaded"); // projects list, domains list\n' "'vercel'" "'local'" "'vercel'" > apps/web/api/__st_fp.js
printf 'echo "Open $URL to link your account"\ngit submodule update --remote\nsupabase db reset\nsupabase test db\nnpx vercel dev\n' > scripts/ci/__st_fp.sh
expect_pass "regla 6: código legítimo (redirección /login, lista de acciones, host ficticio, --remote de git, vercel dev)" env BASE_REF=HEAD bash scripts/ci/migrations_policy.sh
reset_tree

# Envoltorio existente del repositorio: una operación remota a través de sbr en db_supabase.sh
printf 'sbr "$OUT/09.log" db pu%s\n' sh >> scripts/ci/db_supabase.sh
expect_fail "regla 6: operación remota mediante el envoltorio sbr" "db_supabase.sh" env BASE_REF=HEAD bash scripts/ci/migrations_policy.sh
reset_tree

printf 'on: pull_request_targ%s\npermissions: write-%s\njobs:\n  x:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: echo "${{ toJSON(secre%s) }}"\n' et all ts > .github/workflows/__selftest_evil.yml
expect_fail "regla 6: workflow con pull_request_target, write-all y toJSON(secrets)" "__selftest_evil" env BASE_REF=HEAD bash scripts/ci/migrations_policy.sh
reset_tree

printf '        env:\n          T: ${{ secre%s.PROD_TOKEN }}\n' ts >> .github/workflows/ci.yml
expect_fail "regla 6: el workflow usa secretos" "no pueden usar secretos" env BASE_REF=HEAD bash scripts/ci/migrations_policy.sh
reset_tree

python3 -c "import secrets,base64;h='RSA PRIVATE '+'KEY';print('-----BEGIN '+h+'-----');[print(base64.b64encode(secrets.token_bytes(48)).decode()) for _ in range(12)];print('-----END '+h+'-----')" > apps/web/src/__selftest_key.pem
expect_fail "secretos: llave privada en el árbol" "leaks found|private-key|__selftest_key" bash scripts/ci/secrets_scan.sh
reset_tree

G commit -q --allow-empty -m "cambios varios"
expect_fail "commits: mensaje no convencional" "cambios varios" bash scripts/ci/check_commits.sh HEAD~1 HEAD
git reset -q --hard HEAD~1

expect_fail "commits: base desconocida no se aprueba" "ERROR FATAL" bash scripts/ci/check_commits.sh deadbeefdeadbeefdeadbeefdeadbeefdeadbeef HEAD
expect_fail "commits: título de PR no convencional" "título del PR" env PR_TITLE="arreglos" bash scripts/ci/check_commits.sh HEAD HEAD

touch .env.local && G add -f .env.local && G commit -qm "chore: add env"
expect_fail "commits: archivo prohibido (.env.local)" "archivos prohibidos" bash scripts/ci/check_commits.sh HEAD~1 HEAD
git reset -q --hard HEAD~1

expect_fail "rama: nombre no permitido" "Mi-Rama" bash scripts/ci/check_branch_name.sh "Mi-Rama"
expect_fail "rama: feat/* directo a main" "a main solo se integran" bash scripts/ci/check_branch_name.sh feat/x main

expect_fail "ci-gate: un job skipped" "FALLA" env NEEDS_JSON="$ONE_SKIPPED" bash scripts/ci/ci_gate.sh
expect_fail "ci-gate: jobs ausentes" "ausente" env NEEDS_JSON='{"governance":{"result":"success"}}' bash scripts/ci/ci_gate.sh
expect_fail "resolve_base: before desconocido (historial reescrito)" "no existe en el clon" env EVENT_NAME=push PUSH_BEFORE=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef bash scripts/ci/resolve_base.sh
G commit -q --allow-empty -m "test: rewritten tip"; REWRITTEN=$(git rev-parse HEAD); git reset -q --hard HEAD~1
expect_fail "resolve_base: push sin avance rápido a una rama protegida (main)" "sin avance rápido" env EVENT_NAME=push REF_NAME=main PUSH_BEFORE="$REWRITTEN" bash scripts/ci/resolve_base.sh
expect_pass "resolve_base: push sin avance rápido a una mission/* (rebase) → merge-base" env EVENT_NAME=push REF_NAME=mission/m25-x PUSH_BEFORE="$REWRITTEN" DEFAULT_BRANCH=selftest-default bash scripts/ci/resolve_base.sh
expect_fail "resolve_base: rama desconocida (REF vacío) sin avance rápido se trata como protegida" "sin avance rápido" env -u GITHUB_REF_NAME EVENT_NAME=push REF_NAME= PUSH_BEFORE="$REWRITTEN" bash scripts/ci/resolve_base.sh
# Las referencias se comparten con el repositorio principal: se guarda y restaura el valor real de origin/develop.
OLD_DEVELOP=$(git rev-parse -q --verify refs/remotes/origin/develop || true)
git update-ref refs/remotes/origin/develop HEAD~1
expect_pass "resolve_base: mission/* rebasada se compara con origin/develop" env EVENT_NAME=push REF_NAME=mission/m25-x PUSH_BEFORE="$REWRITTEN" bash -c '[[ "$(bash scripts/ci/resolve_base.sh 2>/dev/null)" == "$(git rev-parse HEAD~1)" ]]'
if [[ -n "$OLD_DEVELOP" ]]; then git update-ref refs/remotes/origin/develop "$OLD_DEVELOP"; else git update-ref -d refs/remotes/origin/develop; fi
expect_fail "resolve_base: rama por defecto borrada y recreada (before=000…)" "borrada y recreada" env EVENT_NAME=push REF_NAME=main DEFAULT_BRANCH=main PUSH_BEFORE=0000000000000000000000000000000000000000 bash scripts/ci/resolve_base.sh
expect_fail "resolve_base: PR sin base conocida" "base del PR desconocida" env EVENT_NAME=pull_request PR_BASE_SHA=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef bash scripts/ci/resolve_base.sh

echo 'x' > __selftest_dirty.txt
expect_fail "run_all: REQUIRE_CLEAN con árbol sucio" "00_clean_tree" env REQUIRE_CLEAN=1 CI_STAGES=none CI_OUT="$WT.ciout" bash scripts/ci/run_all.sh
rm -rf "$WT.ciout"; reset_tree

git update-ref -d refs/remotes/origin/selftest-default 2>/dev/null
echo "controles correctos: $ok/$total"
[[ $ok -eq $total ]]
