#!/usr/bin/env bash
# Valida que los commits del rango sigan Conventional Commits y que no se incluyan archivos prohibidos.
# Uso: check_commits.sh <base> [head]       (en CI: base del PR o github.event.before)
#      PR_TITLE="..." check_commits.sh ...  (además valida el título del PR, que es el mensaje del squash)
# Salida: 0 OK · 1 violación · 2 base/head no resolubles (nunca se aprueba un rango que no se pudo leer).
set -uo pipefail
BASE="${1:?uso: check_commits.sh <base> [head]}"; HEAD="${2:-HEAD}"
RE='^(feat|fix|docs|chore|test|refactor|perf|ci|build|db|style|revert)(\([a-z0-9._-]+\))?!?: .{1,100}$'
git rev-parse -q --verify "$BASE^{commit}" >/dev/null || { echo "ERROR FATAL: base '$BASE' no es un commit conocido (¿fetch-depth: 0? ¿force-push?)"; exit 2; }
git rev-parse -q --verify "$HEAD^{commit}" >/dev/null || { echo "ERROR FATAL: head '$HEAD' no es un commit conocido"; exit 2; }
log=$(git log --format='%H%x09%P%x09%s' "$BASE..$HEAD") || { echo "ERROR FATAL: git log falló"; exit 2; }
names=$(git diff --name-only "$BASE" "$HEAD") || { echo "ERROR FATAL: git diff falló"; exit 2; }
fail=0; n=0
while IFS=$'\t' read -r sha parents subject; do
  [[ -z "$sha" ]] && continue
  n=$((n + 1))
  # Los merges (2+ padres) se aceptan con su mensaje estándar de git
  if [[ $(wc -w <<< "$parents") -gt 1 ]]; then continue; fi
  if [[ ! "$subject" =~ $RE ]]; then echo "ERROR commit ${sha:0:7}: '$subject' no sigue Conventional Commits"; fail=1; fi
done <<< "$log"
if [[ -n "${PR_TITLE:-}" ]]; then
  if [[ "$PR_TITLE" =~ $RE ]]; then echo "título del PR válido"; else echo "ERROR: el título del PR '$PR_TITLE' no sigue Conventional Commits"; fail=1; fi
fi
# Archivos que nunca deben versionarse
bad=$(grep -E '(^|/)\.env($|\.)|\.pem$|\.p12$|\.key$|id_rsa|id_ed25519|supabase/\.temp/|^ci-artifacts/' <<< "$names" | grep -v '\.env\.example$' || true)
[[ -n "$bad" ]] && { echo "ERROR: archivos prohibidos en el rango:"; echo "$bad"; fail=1; }
echo "commits revisados: $n"; [[ $fail -eq 0 ]] && echo "convenciones de commits: OK"
exit $fail
