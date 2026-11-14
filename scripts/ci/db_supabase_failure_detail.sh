#!/usr/bin/env bash
# Ejecución 134: imprime en el log del job, SIN secretos, por qué falló `db-supabase`.
# Motivo: el resultado solo quedaba en el artefacto y el agente no puede descargar artefactos (CDN bloqueada),
# así que el job estuvo en rojo desde la ejecución 122 sin diagnóstico. Todo pasa por un redactor de llaves/JWT.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CI="${CI_OUT:-$ROOT/ci-artifacts}"; OUT="$CI/db_supabase"
redact() { sed -E \
  -e 's/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/<jwt-redactado>/g' \
  -e 's/eyJ[A-Za-z0-9_-]{10,}/<jwt-redactado>/g' \
  -e 's/sb_(secret|publishable)_[A-Za-z0-9_-]+/<llave-redactada>/g' \
  -e 's/("[A-Za-z0-9_]*(SECRET|KEY|PASSWORD|TOKEN|secret|key|password|token)[A-Za-z0-9_]*"[[:space:]]*:[[:space:]]*")[^"]*/\1<redactado>/g' \
  -e 's/((secret|key|password|token|authorization|apikey)[[:space:]]*(:|=|│|\|)[[:space:]]*)[^[:space:]│|]{8,}/\1<redactado>/Ig'; }
show() { local title="$1" file="$2" filter="$3" n="$4"; [[ -f "$file" ]] || { echo "--- $title: (no existe)"; return; }
  echo "--- $title"; if [[ -n "$filter" ]]; then grep -E "$filter" "$file" | tail -n "$n"; else tail -n "$n" "$file"; fi | cut -c1-400 | redact; }
show "resumen de la etapa (31_db_supabase.log)" "$CI/logs/31_db_supabase.log" "" 60
show "advertencias start/reset" "$OUT/warnings.txt" "" 20
show "pgTAP: fallos" "$OUT/03_test_db.log" '^not ok|Failed|Files=|Result|# +(got|expected|Looks)' 60
show "HTTP: comprobaciones fallidas" "$OUT/04_http.log" 'FAIL|Error|Traceback|assert' 40
show "HTTP: final" "$OUT/04_http.log" "" 8
show "pedido y pago: final" "$OUT/04b_payment_flow.log" "" 30
show "reset (1) final" "$OUT/02_reset.log" "" 15
exit 0
