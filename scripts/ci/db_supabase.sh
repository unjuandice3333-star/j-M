#!/usr/bin/env bash
# =============================================================================
# Integración de BD en el stack OFICIAL de Supabase local (Docker + Supabase CLI):
#   start → db reset → test db (290) → 39 verificaciones HTTP → instantánea
#   → stop --no-backup → start → db reset → instantánea → comparación (determinismo).
# Sin pasos manuales tras `db reset`. Solo stack local: aborta si detecta un proyecto enlazado.
# Variables: SUPABASE_BIN (por defecto "supabase"), CI_OUT.
# =============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${CI_OUT:-$ROOT/ci-artifacts}/db_supabase"
rm -rf "${OUT:?}"; mkdir -p "$OUT"   # nunca reutilizar instantáneas de una ejecución anterior
MIN_TESTS="${MIN_TESTS:-290}"      # número mínimo de pruebas pgTAP que deben ejecutarse
SB="${SUPABASE_BIN:-supabase}"
EXCLUDE="studio,realtime,edge-runtime,logflare,vector,imgproxy,mailpit,postgres-meta,supavisor"
DB=supabase_db_jm-fashion-store
cd "$ROOT"

if [[ -f supabase/.temp/project-ref || -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "ERROR: proyecto remoto enlazado o token presente; la fábrica solo usa el stack local"; exit 3
fi
docker info >/dev/null 2>&1 || { echo "ERROR: Docker no disponible"; exit 2; }

fail=0
step() { echo "== $1"; }
# Las salidas de la CLI incluyen llaves locales de demostración: se redactan ANTES de escribir evidencias.
# Cubre la salida JSON (-o json) y la salida en tabla/texto (formato "Nombre: valor" o "│ nombre │ valor │").
redact() { sed -E \
  -e 's/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/<jwt-redactado>/g' \
  -e 's/sb_(secret|publishable)_[A-Za-z0-9_-]+/<llave-redactada>/g' \
  -e 's/("[A-Z0-9_]*(SECRET|KEY|KEY_ID|PASSWORD)[A-Z0-9_]*":")[^"]*/\1<redactado>/g' \
  -e 's/((secret|key|access key id|password)[[:space:]]*(:|│|\|)[[:space:]]*)[^[:space:]│|]{8,}/\1<redactado>/Ig'; }
sbr() { local log="$1"; shift; "$SB" "$@" 2>&1 | redact > "$log"; return "${PIPESTATUS[0]}"; }
snapshot() { bash "$ROOT/scripts/ci/lib/db_snapshot.sh" "$DB" "$1" >/dev/null && grep -vE '^\\(un)?restrict ' "$1/schema.sql" > "$1/schema_normalized.sql" \
             && ( cd "$1" && md5sum schema_normalized.sql privileges.txt constraints.txt functions.txt policies.txt reference_data.txt seeds.txt > checksums.md5 ); }

step "start (1)";  sbr "$OUT/01_start.log" start -x "$EXCLUDE" || { echo "start falló"; exit 1; }
step "db reset";   sbr "$OUT/02_reset.log" db reset || fail=1
grep -hE '^WARN|WARNING:|ERROR:' "$OUT/01_start.log" "$OUT/02_reset.log" | grep -vE 'Retrying|failed to copy' > "$OUT/warnings.txt" || true
echo "advertencias en start/reset: $(wc -l < "$OUT/warnings.txt")"
step "instantánea A"; snapshot "$OUT/snapshot_A" || { echo "instantánea A falló"; fail=1; }
step "test db";    sbr "$OUT/03_test_db.log" test db || fail=1
grep -E 'Files=|Result' "$OUT/03_test_db.log"
ntests=$(grep -oE 'Tests=[0-9]+' "$OUT/03_test_db.log" | tail -1 | cut -d= -f2)
if [[ -z "$ntests" || "$ntests" -lt "$MIN_TESTS" ]]; then echo "ERROR: se ejecutaron ${ntests:-0} pruebas pgTAP (mínimo $MIN_TESTS)"; fail=1; fi
step "HTTP";       $SB status -o json > "$OUT/.status.json" 2>/dev/null
NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost python3 -I "$ROOT/scripts/ci/lib/http_checks.py" "$OUT/.status.json" "$OUT/04_http_results.json" > "$OUT/04_http.log" 2>&1 || fail=1
rm -f "$OUT/.status.json"; tail -1 "$OUT/04_http.log"
step "stop + reconstrucción (2)"
sbr "$OUT/05_stop.log" stop --no-backup
sbr "$OUT/06_start2.log" start -x "$EXCLUDE" || fail=1
sbr "$OUT/07_reset2.log" db reset || fail=1
step "instantánea B"; snapshot "$OUT/snapshot_B" || { echo "instantánea B falló"; fail=1; }
if [[ -s "$OUT/snapshot_A/checksums.md5" && -s "$OUT/snapshot_B/checksums.md5" ]] && diff -q "$OUT/snapshot_A/checksums.md5" "$OUT/snapshot_B/checksums.md5" >/dev/null; then echo "determinismo: OK (7/7)"; else echo "determinismo: FALLA"; diff "$OUT/snapshot_A/checksums.md5" "$OUT/snapshot_B/checksums.md5"; fail=1; fi
sbr "$OUT/08_stop.log" stop --no-backup
grep -rlE "eyJhbGci[A-Za-z0-9_-]{20,}|sb_secret_|sb_publishable_|super-secret-jwt-token" "$OUT" && { echo "ERROR: llaves en evidencias"; fail=1; }
exit $fail
