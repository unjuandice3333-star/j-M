#!/usr/bin/env bash
# run_gitleaks <args...>: binario local o imagen Docker FIJADA POR DIGEST (no solo por etiqueta).
# El repositorio se monta en su misma ruta y, si es un worktree, también el directorio git común,
# para que el .git (archivo con ruta absoluta) se resuelva dentro del contenedor.
GITLEAKS_IMAGE="zricethezav/gitleaks:v8.21.2@sha256:0e99e8821643ea5b235718642b93bb32486af9c8162c8b8731f7cbdc951a7f46"
run_gitleaks() {
  if command -v gitleaks >/dev/null 2>&1; then gitleaks "$@"; return; fi
  docker info >/dev/null 2>&1 || { echo "ERROR: ni gitleaks ni Docker disponibles"; return 2; }
  local root common extra=()
  root="$(git rev-parse --show-toplevel)"
  common="$(cd "$root" && cd "$(git rev-parse --git-common-dir)" && pwd)"
  [[ "$common" != "$root/.git" ]] && extra=(-v "$common:$common:ro")
  docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$root:$root" "${extra[@]}" -w "$PWD" \
    "$GITLEAKS_IMAGE" "$@"
}
