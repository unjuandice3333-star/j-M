#!/usr/bin/env bash
# =============================================================================
# APLICA la protección de ramas en GitHub. OPERACIÓN EXTERNA: cambia permisos del repositorio.
# La fábrica NO la ejecuta: requiere autorización explícita del propietario y que este la ejecute
# con su propia sesión de `gh` (permiso admin). Antes de aplicarla, la rama `develop` debe existir
# en el remoto y el workflow `ci` debe haber corrido al menos una vez (para que exista el check `ci-gate`).
# =============================================================================
set -euo pipefail
REPO="${REPO:-unjuandice3333-star/j-M}"
[[ "${I_AM_THE_OWNER_AND_AUTHORIZE:-}" == "yes" ]] || { echo "Defina I_AM_THE_OWNER_AND_AUTHORIZE=yes para confirmar"; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
for b in main develop; do
  gh api -X PUT "repos/$REPO/branches/$b/protection" -H "Accept: application/vnd.github+json" --input "$HERE/branch-protection.$b.json"
  echo "protección aplicada a $b"
done
