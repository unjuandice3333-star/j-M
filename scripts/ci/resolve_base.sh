#!/usr/bin/env bash
# Determina el commit base contra el que se validan commits y migraciones. Imprime el SHA.
#   pull_request                    → SHA de la rama destino del PR (desconocido → exit 2).
#   push con before conocido        → before, SOLO si es antecesor de HEAD (avance rápido).
#                                      Un push que no avanza rápido (force-push que reescribe o retrocede) → exit 2.
#   push con before desconocido ≠0  → exit 2 (historial reescrito: no hay nada fiable con qué comparar).
#   push con before=000… (rama nueva) o workflow_dispatch (sin before)
#                                    → merge-base con origin/<rama por defecto>. Si coincide con HEAD
#                                      (rama creada en un commit existente, o dispatch sobre la rama por
#                                      defecto), no hay commits nuevos: se devuelve HEAD con un aviso y las
#                                      reglas que no dependen de la base (formato, regla 6, workflows) siguen aplicándose.
# Nunca HEAD~1. Entradas: EVENT_NAME, PR_BASE_SHA, PUSH_BEFORE, DEFAULT_BRANCH (por defecto main).
# Salida: 0 y SHA en stdout · 2 si no hay base fiable (la CI debe fallar).
set -uo pipefail
is_zero() { [[ -z "$1" || "$1" =~ ^0+$ ]]; }
known() { git rev-parse -q --verify "$1^{commit}" >/dev/null; }
DEF="origin/${DEFAULT_BRANCH:-main}"
HEAD_SHA=$(git rev-parse HEAD)

if [[ "${EVENT_NAME:-}" == pull_request ]]; then
  if ! is_zero "${PR_BASE_SHA:-}" && known "$PR_BASE_SHA"; then git rev-parse "$PR_BASE_SHA"; exit 0; fi
  echo "ERROR: base del PR desconocida (${PR_BASE_SHA:-vacía})" >&2; exit 2
fi

BEFORE="${PUSH_BEFORE:-}"
if ! is_zero "$BEFORE"; then
  known "$BEFORE" || { echo "ERROR: before '$BEFORE' no existe en el clon (¿historial reescrito?)" >&2; exit 2; }
  git merge-base --is-ancestor "$BEFORE" HEAD || { echo "ERROR: push sin avance rápido ($BEFORE no es antecesor de HEAD): reescritura o retroceso de historial" >&2; exit 2; }
  git rev-parse "$BEFORE"; exit 0
fi

# Rama nueva o ejecución manual: comparar con la rama por defecto
known "$DEF" || { echo "ERROR: $DEF no existe en el clon (¿fetch-depth: 0?)" >&2; exit 2; }
mb=$(git merge-base HEAD "$DEF") || { echo "ERROR: sin merge-base con $DEF" >&2; exit 2; }
[[ "$mb" == "$HEAD_SHA" ]] && echo "AVISO: sin commits nuevos respecto a $DEF; se validan las reglas independientes de la base" >&2
echo "$mb"
