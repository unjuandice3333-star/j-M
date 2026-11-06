#!/usr/bin/env bash
# Integración de BD en PostgreSQL 16 local (sin Docker): reconstrucción + pgTAP + concurrencia + determinismo.
# Delegado en supabase/tests/run_local.sh. Debe ejecutarse con un usuario NO root.
# Además exige que se ejecute un mínimo de pruebas (MIN_TESTS, por defecto 290 = 278 funcionales + 12 de concurrencia),
# para que un archivo de pruebas omitido o vacío no pase inadvertido.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIN_TESTS="${MIN_TESTS:-290}"
if [[ "$(id -u)" -eq 0 ]]; then
  echo "ERROR: initdb no admite root; ejecutar como usuario sin privilegios (en CI: runner; local: su postgres)"; exit 2
fi
LOG="$(mktemp)"; trap 'rm -f "$LOG"' EXIT
"$ROOT/supabase/tests/run_local.sh" 2>&1 | tee "$LOG"
rc=${PIPESTATUS[0]}
total=$(grep -oE 'Tests=[0-9]+' "$LOG" | cut -d= -f2 | awk '{s+=$1} END {print s+0}')
echo "pruebas pgTAP ejecutadas: $total (mínimo $MIN_TESTS)"
if [[ "$total" -lt "$MIN_TESTS" ]]; then echo "ERROR: se ejecutaron menos pruebas de las exigidas"; rc=1; fi
exit "$rc"
