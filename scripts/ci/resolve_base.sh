#!/usr/bin/env bash
# Determina el commit base contra el que se validan commits y migraciones. Imprime el SHA.
#   pull_request → SHA de la rama destino del PR.
#   push         → github.event.before; si es 000… (rama nueva) o no existe en el clon (force-push),
#                  merge-base con origin/<rama por defecto>. Así se revisa MÁS, nunca menos. Nunca HEAD~1.
# Entradas (entorno): EVENT_NAME, PR_BASE_SHA, PUSH_BEFORE, DEFAULT_BRANCH (por defecto main).
# Salida: 0 y SHA en stdout · 2 si no hay ninguna base resoluble (la CI debe fallar).
set -uo pipefail
known() { [[ -n "$1" && ! "$1" =~ ^0+$ ]] && git rev-parse -q --verify "$1^{commit}" >/dev/null; }
DEF="origin/${DEFAULT_BRANCH:-main}"
if [[ "${EVENT_NAME:-}" == pull_request ]]; then
  known "${PR_BASE_SHA:-}" && { git rev-parse "$PR_BASE_SHA"; exit 0; }
  echo "ERROR: base del PR desconocida (${PR_BASE_SHA:-vacía})" >&2; exit 2
fi
HEAD_SHA=$(git rev-parse HEAD)
if known "${PUSH_BEFORE:-}"; then git rev-parse "$PUSH_BEFORE"; exit 0; fi
if git rev-parse -q --verify "$DEF^{commit}" >/dev/null; then
  echo "AVISO: before '${PUSH_BEFORE:-}' no utilizable; se usa merge-base con $DEF" >&2
  mb=$(git merge-base HEAD "$DEF") || { echo "ERROR: sin merge-base con $DEF" >&2; exit 2; }
  # Push (p. ej. force-push) a la propia rama por defecto: el merge-base es HEAD y no habría nada que comparar
  if [[ "$mb" == "$HEAD_SHA" ]]; then echo "ERROR: la base resultante es HEAD (rango vacío); no se puede validar este push" >&2; exit 2; fi
  echo "$mb"; exit 0
fi
echo "ERROR: no hay base resoluble (before='${PUSH_BEFORE:-}', $DEF ausente)" >&2; exit 2
