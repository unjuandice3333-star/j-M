#!/usr/bin/env bash
# Escaneo de secretos con gitleaks (binario local o imagen Docker fijada por digest).
# Historial git completo de la rama + árbol de trabajo. Informes JSON (redactados) en $CI_OUT.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
OUT="${CI_OUT:-$ROOT/ci-artifacts}"; mkdir -p "$OUT"
source "$ROOT/scripts/ci/lib/gitleaks.sh"
rc=0
echo "== historial git"
run_gitleaks git --config .gitleaks.toml --redact --no-banner --report-format json --report-path "$OUT/gitleaks_git.json" . || rc=1
echo "== árbol de trabajo"
run_gitleaks dir --config .gitleaks.toml --redact --no-banner --report-format json --report-path "$OUT/gitleaks_dir.json" . || rc=1
exit $rc
