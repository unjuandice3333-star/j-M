#!/usr/bin/env bash
# Valida el nombre de rama (CONTRIBUTING.md §1) y, si se indica la rama destino de un PR, el flujo permitido.
# Uso: check_branch_name.sh [rama] [rama-destino]
#      (por defecto la rama actual; en CI: GITHUB_HEAD_REF / GITHUB_REF_NAME y GITHUB_BASE_REF)
set -uo pipefail
B="${1:-${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-$(git rev-parse --abbrev-ref HEAD)}}}"
T="${2:-${GITHUB_BASE_REF:-}}"
RE='^(main|develop|release/[0-9]+\.[0-9]+(\.[0-9]+)?|hotfix/[a-z0-9][a-z0-9.-]*|mission/m[0-9]{2}[a-z]?-[a-z0-9][a-z0-9-]*|agent/(orchestrator|developer|qa|reviewer|backend|frontend|db|payments|e2e|docs)/m[0-9]{2}[a-z]?-[a-z0-9][a-z0-9-]*|(feat|fix|chore|docs|test|refactor|perf|ci|db)/[a-z0-9][a-z0-9.-]*)$'
BOT_RE='^(dependabot|renovate)/.+$'   # ramas de bots de dependencias
if [[ "$B" =~ $RE ]]; then echo "rama válida: $B"
elif [[ "$B" =~ $BOT_RE ]]; then echo "rama de bot de dependencias aceptada: $B"
else
  echo "ERROR: nombre de rama no válido: '$B'"
  echo "Formatos: main | develop | release/X.Y[.Z] | hotfix/<slug> | mission/mNN-<slug>"
  echo "          agent/<rol>/mNN-<slug> | <tipo>/<slug> con tipo en feat|fix|chore|docs|test|refactor|perf|ci|db"
  exit 1
fi
# Flujo de integración (separación entre desarrollo y liberación)
if [[ -n "$T" ]]; then
  case "$T" in
    main)      [[ "$B" =~ ^(release/|hotfix/) ]] || { echo "ERROR: a main solo se integran release/* o hotfix/* (origen: $B)"
                 [[ "$B" =~ $BOT_RE ]] && echo "Las actualizaciones de dependencias deben apuntar a develop (Dependabot: target-branch: develop)"
                 exit 1; } ;;
    release/*) [[ "$B" =~ ^(fix/|hotfix/) ]]     || { echo "ERROR: a $T solo se integran fix/* o hotfix/* (origen: $B)"; exit 1; } ;;
    mission/*) [[ "$B" =~ ^agent/ ]]             || { echo "ERROR: a $T solo se integran ramas agent/* (origen: $B)"; exit 1; } ;;
  esac
  echo "flujo de integración válido: $B → $T"
fi
exit 0
