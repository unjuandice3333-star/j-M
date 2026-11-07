#!/usr/bin/env bash
# =============================================================================
# M35 — E2E de NAVEGADOR contra el stack OFICIAL de Supabase LOCAL (Docker + Supabase CLI). Sin mocks de backend.
#   start → db reset (migraciones + seeds de QA) → status → Vite (con variables de servidor locales, para /api/wompi/*)
#   → recorridos con aserciones de apps/web/e2e (M28) → limpieza (stop --no-backup, Vite detenido).
# Solo loopback: aborta si hay un proyecto remoto enlazado o un token de Supabase. Wompi NO se contacta: los secretos y la
# llave son aleatorios, de prueba y generados en ejecución (los webhooks los firma el propio recorrido).
# Variables: SUPABASE_BIN, CI_OUT. Requiere Docker, psql y Chromium de Playwright.
# =============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${CI_OUT:-$ROOT/ci-artifacts}/e2e_supabase"
rm -rf "${OUT:?}"; mkdir -p "$OUT"
SB="${SUPABASE_BIN:-supabase}"
EXCLUDE="studio,realtime,edge-runtime,logflare,vector,imgproxy,mailpit,postgres-meta,supavisor"
PORT=3000
cd "$ROOT"

if [[ -f supabase/.temp/project-ref || -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then echo "ERROR: proyecto remoto enlazado o token presente; solo se usa el stack local"; exit 3; fi
docker info >/dev/null 2>&1 || { echo "ERROR: Docker no disponible"; exit 2; }
command -v psql >/dev/null || { echo "ERROR: falta psql"; exit 2; }
command -v jq >/dev/null || { echo "ERROR: falta jq"; exit 2; }

redact() { sed -E \
  -e 's/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/<jwt-redactado>/g' \
  -e 's/sb_(secret|publishable)_[A-Za-z0-9_-]+/<llave-redactada>/g' \
  -e 's/("[A-Z0-9_]*(SECRET|KEY|KEY_ID|PASSWORD)[A-Z0-9_]*":")[^"]*/\1<redactado>/g' \
  -e 's/((secret|key|access key id|password)[[:space:]]*(:|│|\|)[[:space:]]*)[^[:space:]│|]{8,}/\1<redactado>/Ig'; }
STATUS="$OUT/.status.json"; VITE_PID=""
cleanup() {
  [[ -n "$VITE_PID" ]] && kill "$VITE_PID" 2>/dev/null
  pkill -f "vite.js --port $PORT" 2>/dev/null || pkill -f "vite --port $PORT" 2>/dev/null || true
  "$SB" stop --no-backup 2>&1 | redact > "$OUT/99_stop.log"
  rm -f "$STATUS"
}
trap cleanup EXIT

echo "== start";  "$SB" start -x "$EXCLUDE" 2>&1 | redact > "$OUT/01_start.log" || { echo "start falló"; tail -20 "$OUT/01_start.log"; exit 1; }
echo "== db reset (migraciones + seeds de QA locales)"; "$SB" db reset 2>&1 | redact > "$OUT/02_reset.log" || { echo "db reset falló"; tail -20 "$OUT/02_reset.log"; exit 1; }
"$SB" status -o json > "$STATUS" 2>/dev/null || { echo "status falló"; exit 1; }
node -e "const s=JSON.parse(require('fs').readFileSync('$STATUS','utf8'));if(!String(s.API_URL).startsWith('http://127.0.0.1'))process.exit(3)" || { echo "ERROR: el stack no es loopback"; exit 3; }

# Entorno de Vite: variables de cliente y de SERVIDOR (las funciones /api/wompi/* del plugin de desarrollo las leen).
rnd() { node -e "process.stdout.write(require('crypto').randomBytes(12).toString('hex'))"; }
export WOMPI_EVENTS_SECRET="test_events_$(rnd)"
WOMPI_INTEGRITY_SECRET="test_integrity_$(rnd)"
WOMPI_PUBLIC_KEY="pub_test_$(rnd)"
SB_URL=$(jq -r .API_URL "$STATUS"); SB_ANON=$(jq -r .ANON_KEY "$STATUS"); SB_SERVICE=$(jq -r .SERVICE_ROLE_KEY "$STATUS")
[[ -n "$SB_URL" && -n "$SB_ANON" && -n "$SB_SERVICE" && "$SB_URL" != null ]] || { echo "ERROR: status sin API_URL/ANON_KEY/SERVICE_ROLE_KEY"; exit 1; }
echo "== vite (puerto $PORT)"
(
  cd apps/web
  env APP_ENV=local VITE_APP_ENV=local \
    VITE_SUPABASE_URL="$SB_URL" VITE_SUPABASE_ANON_KEY="$SB_ANON" VITE_WOMPI_PUBLIC_KEY="$WOMPI_PUBLIC_KEY" VITE_WOMPI_ENV=sandbox \
    SUPABASE_URL="$SB_URL" SUPABASE_SERVICE_ROLE_KEY="$SB_SERVICE" WOMPI_PUBLIC_KEY="$WOMPI_PUBLIC_KEY" WOMPI_INTEGRITY_SECRET="$WOMPI_INTEGRITY_SECRET" \
    WOMPI_EVENTS_SECRET="$WOMPI_EVENTS_SECRET" WOMPI_ENV=sandbox \
    ./node_modules/.bin/vite --port "$PORT" --strictPort --host 0.0.0.0 2>&1 | redact > "$OUT/03_vite.log"
) &
VITE_PID=$!
up=0; for _ in $(seq 1 60); do curl -fs -o /dev/null "http://127.0.0.1:$PORT/" && { up=1; break; }; sleep 1; done
[[ $up == 1 ]] || { echo "ERROR: Vite no arrancó"; tail -20 "$OUT/03_vite.log"; exit 1; }

fail=0; : > "$OUT/results.tsv"
export STATUS_JSON="$STATUS" NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost
for t in e2e_site_content e2e_wishlist e2e_cart_variant e2e_session e2e_commercial; do
  echo "== $t"
  timeout 300 node "apps/web/e2e/$t.cjs" 2>&1 | redact > "$OUT/$t.log"; rc=${PIPESTATUS[0]}
  printf '%s\t%s\n' "$t" "$rc" >> "$OUT/results.tsv"
  tail -4 "$OUT/$t.log"
  [[ $rc -eq 0 ]] || fail=1
done
echo "== resultados"; cat "$OUT/results.tsv"
grep -rlE "eyJhbGci[A-Za-z0-9_-]{20,}|sb_secret_|sb_publishable_|super-secret-jwt-token" "$OUT" && { echo "ERROR: llaves en evidencias"; fail=1; }
exit $fail
