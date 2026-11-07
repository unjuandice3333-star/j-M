#!/usr/bin/env bash
# Agregador de compuertas: recibe el JSON de `needs` de GitHub Actions (toJSON(needs)) en $NEEDS_JSON
# y falla salvo que TODOS los jobs requeridos existan y terminen en "success".
# skipped, failure, cancelled o un job ausente → fallo. Probado en gate_selftest.sh.
set -uo pipefail
REQUIRED="${REQUIRED_JOBS:-governance quality e2e-synthetic security db-local db-supabase}"
python3 -I - "$REQUIRED" <<'PY'
import json, os, sys
needs = json.loads(os.environ.get("NEEDS_JSON") or "{}")
bad = []
for job in sys.argv[1].split():
    res = (needs.get(job) or {}).get("result", "ausente")
    print(f"{job}: {res}")
    if res != "success": bad.append(job)
if bad:
    print("ci-gate: FALLA — compuertas sin éxito: " + ", ".join(bad)); sys.exit(1)
print("ci-gate: OK — todas las compuertas en success")
PY
