#!/usr/bin/env bash
# =============================================================================
# Política de migraciones y de operaciones remotas (M25, revisada tras la revisión independiente).
# Falla si:
#   1. un archivo de supabase/migrations no sigue el formato YYYYMMDDHHMMSS_nombre.sql;
#   2. hay versiones repetidas;
#   3. respecto a la base, se MODIFICA, BORRA o RENOMBRA una migración existente (solo se admiten nuevas);
#   4. una migración nueva tiene una versión <= a la última existente en el punto de referencia;
#   5. se modifica supabase/migrations_legacy/ (historial archivado e inmutable);
#   6. un archivo ejecutable del repositorio (scripts, workflows, package.json, hooks) contiene operaciones
#      remotas de Supabase/Postgres o usa secretos/entornos de GitHub en los workflows.
#
# Comparación: base (merge-base con BASE_REF) contra el ÁRBOL DE TRABAJO (incluye cambios sin commit).
# Excepción única M24B: el commit 91830903 (línea base consolidada) movió las 16 migraciones históricas a
# migrations_legacy/. Si ese commit está dentro del rango, se valida base→padre(M24B) y M24B→árbol; el propio
# commit M24B queda exento. La excepción depende de ese SHA concreto, no de la existencia de un archivo.
#
# Uso: BASE_REF=<rama|commit> migrations_policy.sh
#      POLICY_ROOT=<repo>  → evalúa otro checkout (permite ejecutar la copia confiable de la rama base).
# Salida: 0 OK · 1 violación · 2 base no resoluble o error de git (nunca se aprueba sin comparar).
# =============================================================================
set -uo pipefail
ROOT="${POLICY_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"; cd "$ROOT"
MIG=supabase/migrations
LEG=supabase/migrations_legacy
M24B=91830903ac2539ea077be97e9676e24914b4a778
fail=0
err() { echo "ERROR: $*"; fail=1; }
die() { echo "ERROR FATAL: $*"; exit 2; }

# --- 1 y 2: formato y unicidad (árbol de trabajo) ------------------------------
prev=""; n=0
while IFS= read -r f; do
  n=$((n + 1))
  [[ "$f" =~ ^[0-9]{14}_[a-z0-9_]+\.sql$ ]] || err "nombre inválido: $MIG/$f"
  ver="${f%%_*}"
  [[ -n "$prev" && "$ver" == "$prev" ]] && err "versión repetida: $ver"
  prev="$ver"
done < <(ls "$MIG" | sort)
echo "migraciones activas: $n (última versión $prev)"

# --- 3, 4, 5: comparación con la base -----------------------------------------
BASE_REF="${BASE_REF:-}"
if [[ -z "$BASE_REF" ]]; then
  if git rev-parse -q --verify origin/develop >/dev/null; then BASE_REF=origin/develop
  elif git rev-parse -q --verify origin/main >/dev/null; then BASE_REF=origin/main
  else die "BASE_REF no definido y no existe origin/develop ni origin/main"; fi
fi
git rev-parse -q --verify "$BASE_REF^{commit}" >/dev/null || die "BASE_REF '$BASE_REF' no es un commit conocido (¿falta fetch-depth: 0?)"
BASE=$(git merge-base HEAD "$BASE_REF") || die "sin merge-base entre HEAD y $BASE_REF"
echo "base de comparación: $BASE_REF → merge-base $BASE"

# check_segment <desde> <hasta|WORKTREE>
check_segment() {
  local from="$1" to="$2" args diff added base_last v
  if [[ "$to" == WORKTREE ]]; then args=("$from"); else args=("$from" "$to"); fi
  diff=$(git diff --name-status "${args[@]}" -- "$MIG") || die "git diff falló ($from..$to)"
  local changed; changed=$(grep -vE '^A\s' <<< "$diff" | sed '/^$/d')
  [[ -n "$changed" ]] && err "migraciones existentes modificadas/borradas/renombradas en $from..$to (solo se admiten nuevas):"$'\n'"$changed"
  base_last=$(git ls-tree --name-only "$from" "$MIG/" | sed 's#.*/##' | sort | tail -1 | cut -d_ -f1)
  added=$(git diff --name-only --diff-filter=A "${args[@]}" -- "$MIG") || die "git diff falló"
  # Las migraciones nuevas sin seguimiento (untracked) también cuentan
  [[ "$to" == WORKTREE ]] && added+=$'\n'$(git ls-files -o --exclude-standard -- "$MIG")
  for f in $added; do
    v=$(basename "$f" | cut -d_ -f1)
    [[ -z "$base_last" || "$v" > "$base_last" ]] || err "migración nueva $f con versión <= última existente ($base_last)"
  done
  local legacy; legacy=$(git diff --name-status "${args[@]}" -- "$LEG") || die "git diff falló"
  [[ -n "$legacy" ]] && err "$LEG/ es inmutable ($from..$to):"$'\n'"$legacy"
  [[ "$to" == WORKTREE && -n "$(git ls-files -o --exclude-standard -- "$LEG")" ]] && err "$LEG/ es inmutable: archivos nuevos sin seguimiento"
  return 0
}

if git merge-base --is-ancestor "$M24B" HEAD 2>/dev/null && ! git merge-base --is-ancestor "$M24B" "$BASE"; then
  echo "AVISO: el rango incluye la línea base M24B ($M24B), excepción única documentada en MISION_24B."
  echo "       Se valida base→padre(M24B) y M24B→árbol de trabajo; el commit M24B queda exento."
  check_segment "$BASE" "$M24B^"
  check_segment "$M24B" WORKTREE
else
  check_segment "$BASE" WORKTREE
fi

# --- 6: sin operaciones remotas en la automatización -------------------------
# Archivos ejecutables versionados o nuevos (no la documentación .md), con extensión sin distinguir mayúsculas.
# Se excluye solo este archivo, que necesariamente contiene los patrones.
mapfile -t files < <(git ls-files -co --exclude-standard | grep -v '^node_modules/' \
    | grep -iE '\.(sh|bash|mjs|cjs|js|ts|py|ya?ml|toml)$|(^|/)package\.json$|^\.husky/' \
    | grep -vE '^apps/web/(src|public)/|^packages/[^/]+/(src/|index\.)|\.test\.(ts|js|sql)$' \
    | grep -v '^scripts/ci/migrations_policy\.sh$' | while read -r f; do [[ -f "$f" ]] && echo "$f"; done)
S='[[:space:]]+'
# Invocación de la CLI de Supabase: la palabra supabase, el envoltorio sbr (con su argumento de log) o una
# variable ($X, ${X}, "$X", "${X[@]}"), seguida opcionalmente de banderas globales.
CLI="(\\bsupabase|\\bsbr([[:space:]]+\"[^\"]*\")?|\"?\\\$\\{?[A-Za-z_][A-Za-z0-9_]*(\\[@\\])?\\}?\"?)"
FLAGS="([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*"
# Nivel A — subcomandos y destinos inequívocamente remotos, en cualquier línea y con cualquier forma de invocación.
A="\\bdb${S}(push|pull|dump)\\b|\\bfunctions${S}(deploy|download)\\b|\\bsecrets${S}(set|unset)\\b|\\bmigration${S}(repair|list|fetch)\\b"
A+="|\\bconfig${S}push\\b|\\binspect${S}db\\b|\\bpostgres-config${S}(get|update|delete)\\b"
A+="|\\b(network-restrictions|ssl-enforcement|vanity-subdomains|network-bans)\\b"
A+="|--(project-ref|project-id|db-url|linked)\\b"
# Destinos: API de gestión, pooler y hosts de proyecto con referencia literal (20 caracteres) o interpolada.
# Es intencional que una URL de proyecto construida en el código falle: el servidor debe usar SUPABASE_URL del entorno.
A+="|api\\.supabase\\.(com|io)|pooler\\.supabase\\.com|(\\b[a-z0-9]{20}|\\}|\\\$[A-Za-z_][A-Za-z0-9_]*)\\.supabase\\.co\\b"
A+="|[\"']db[\"'][[:space:],]+[\"'](push|pull|dump)[\"']|[\"']functions[\"'][[:space:],]+[\"'](deploy|download)[\"']"
# Nivel B — subcomandos ambiguos (palabras comunes en texto) SOLO justo después de una invocación de la CLI
B="${CLI}${FLAGS}[[:space:]]+((link|login|logout)\\b|(projects|branches|secrets|storage|sso|domains|snippets|backups|orgs)${S}[a-z-]+)"
B+="|[\"']supabase[\"'][^)]*[\"'](link|login|projects|branches|secrets|storage)[\"']"
# Vercel: el comando en posición de comando o como valor de un script de package.json (salvo `vercel dev`),
# dentro de exec/spawn, o un despliegue invocado mediante una variable.
V="(^|[;&|(\`]|\\bnpx|\\bpnpm([[:space:]]+dlx)?|\\bexec)[[:space:]]*vercel([[:space:]\"']|$)"
V+="|\\b(spawn|spawnSync|exec|execSync|execFile|execFileSync)\\([\"'\`](npx[[:space:]]+)?vercel\\b"
V+="|\":[[:space:]]*\"(npx[[:space:]]+)?vercel\\b"
V+="|\"?\\\$\\{?[A-Za-z_][A-Za-z0-9_]*\\}?\"?${S}(deploy|--prod|promote|alias)\\b"
remote=""
if ((${#files[@]})); then
  remote=$(grep -nHE "$A|$B" "${files[@]}" || true)
  vc=$(grep -nHE "$V" "${files[@]}" | grep -vE "vercel${S}dev\\b" || true)
  [[ -n "$vc" ]] && remote+=$'\n'"$vc"
  remote=$(sed '/^$/d' <<< "$remote")
fi
[[ -n "$remote" ]] && err "la automatización contiene operaciones o destinos remotos:"$'\n'"$remote"

# Workflows (cualquier .yml/.yaml en .github/workflows, sin distinguir mayúsculas)
mapfile -t wf < <(find .github/workflows -maxdepth 1 -type f \( -iname '*.yml' -o -iname '*.yaml' \) 2>/dev/null | sort)
for w in "${wf[@]}"; do
  # Bloque permissions: de nivel superior obligatorio (sin él el token hereda los permisos por defecto del repositorio)
  grep -qE '^permissions:' "$w" || err "$w: falta el bloque 'permissions:' de nivel superior"
  # Secretos en cualquier forma, token del workflow, entornos, eventos con privilegios y cualquier permiso de escritura
  ghs=$(grep -nHiE "\\bsecrets\\b|github\\.token|GITHUB_TOKEN|^[[:space:]]*environment[[:space:]]*:|pull_request_target|workflow_run|issue_comment|pull_request_review|write-all|:[[:space:]]*[\"']?write[\"']?([[:space:]]|,|}|$)" "$w" || true)
  [[ -n "$ghs" ]] && err "los workflows no pueden usar secretos, el token, entornos, eventos privilegiados ni permisos de escritura:"$'\n'"$ghs"
done
echo "archivos de automatización revisados: ${#files[@]} · workflows: ${#wf[@]}"

if [[ $fail -eq 0 ]]; then echo "política de migraciones: OK"; fi
exit $fail
