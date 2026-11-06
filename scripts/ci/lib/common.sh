#!/usr/bin/env bash
# =============================================================================
# Utilidades comunes de CI — J&M FASHION STORE (M25)
# Cada paso registra: comando, código de salida, duración y log completo.
# Evidencias en $CI_OUT (por defecto ./ci-artifacts, ignorado por git).
# =============================================================================
set -uo pipefail

CI_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CI_OUT="${CI_OUT:-$CI_ROOT/ci-artifacts}"
mkdir -p "$CI_OUT/logs"
RESULTS_TSV="$CI_OUT/results.tsv"
[[ -f "$RESULTS_TSV" ]] || printf 'step\tstatus\texit_code\tseconds\tcommand\n' > "$RESULTS_TSV"

# run_step <nombre> <comando...>
# status: PASS | FAIL
run_step() {
  local name="$1"; shift
  local log="$CI_OUT/logs/${name}.log"
  local start end code
  start=$(date +%s)
  {
    echo "### paso: $name"
    echo "### comando: $*"
    echo "### commit: $(git -C "$CI_ROOT" rev-parse HEAD 2>/dev/null || echo desconocido)"
    echo "### inicio: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "$log"
  ( cd "$CI_ROOT" && "$@" ) >> "$log" 2>&1
  code=$?
  end=$(date +%s)
  local status=PASS; [[ $code -ne 0 ]] && status=FAIL
  echo "### fin: $(date -u +%Y-%m-%dT%H:%M:%SZ) exit=$code" >> "$log"
  printf '%s\t%s\t%s\t%s\t%s\n' "$name" "$status" "$code" "$((end - start))" "$*" >> "$RESULTS_TSV"
  printf '[%s] %-28s exit=%-3s %4ss  (%s)\n' "$status" "$name" "$code" "$((end - start))" "$log"
  return $code
}

# record_blocked <nombre> <motivo> — un paso que no pudo ejecutarse NO cuenta como aprobado
record_blocked() {
  local name="$1" reason="$2"
  printf '%s\tBLOCKED\t-\t0\t%s\n' "$name" "$reason" >> "$RESULTS_TSV"
  printf '[BLOCKED] %-26s %s\n' "$name" "$reason"
}

# record_fail <nombre> <motivo> — una precondición de la compuerta no se cumplió: cuenta como fallo
record_fail() {
  local name="$1" reason="$2"
  printf '%s\tFAIL\t-\t0\t%s\n' "$name" "$reason" >> "$RESULTS_TSV"
  printf '[FAIL] %-29s %s\n' "$name" "$reason"
}

# record_skipped <nombre> <motivo> — omitido por el perfil; nunca cuenta como aprobado
record_skipped() {
  local name="$1" reason="$2"
  printf '%s\tSKIPPED\t-\t0\t%s\n' "$name" "$reason" >> "$RESULTS_TSV"
  printf '[SKIPPED] %-26s %s\n' "$name" "$reason"
}

have() { command -v "$1" >/dev/null 2>&1; }
