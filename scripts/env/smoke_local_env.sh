#!/usr/bin/env bash
# =============================================================================
# M26-T5 — Prueba de humo del entorno local (criterio 5 del plan): el entorno se genera SOLO a partir del stack local y
# la aplicación arranca contra él. Opcional y local (usa Docker); no forma parte de `pnpm test:env`.
#
#   1. supabase start (stack local; sin servicios no necesarios)   4. build de la fábrica (`pnpm build:factory`, guarda T2)
#   2. gen_local_env.sh sin llave de Wompi → debe dar exit 3        5. sonda REST con la llave generada → HTTP 200
#   3. gen_local_env.sh con la llave sandbox del usuario → exit 0    6. vite preview + Chromium: arranca, sin ConfigError,
#                                                                       contacta el stack, sin 401/403/5xx (los 4xx de
#                                                                       esquema de la app se informan como aviso)
#   7. limpieza: borra el archivo generado y el bundle; supabase stop --no-backup
#
# Llave de Wompi: el usuario la aporta en SMOKE_WOMPI_PUBLIC_KEY (sandbox, pub_test_…). Si no la aporta, se usa el
# marcador público de CI de config/env/local-ci.env, que nunca autentica contra Wompi (solo permite arrancar la app).
# Nunca sobrescribe apps/web/.env.local: si ya existe, aborta. Las salidas de la CLI (con llaves locales) no se muestran.
# Variables: SUPABASE_BIN, PORT_PREVIEW (4180). Salida: 0 OK · 1 fallo · 2 precondición no cumplida.
# =============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
SB="${SUPABASE_BIN:-supabase}"; PORT="${PORT_PREVIEW:-4180}"; OUT=apps/web/.env.local
EXCLUDE="studio,realtime,edge-runtime,logflare,vector,imgproxy,mailpit,postgres-meta,supavisor"
[[ -e "$OUT" ]] && { echo "ERROR: $OUT ya existe; no se sobrescribe. Muévalo y repita."; exit 2; }
docker info >/dev/null 2>&1 || { echo "ERROR: Docker no disponible"; exit 2; }
[[ -f supabase/.temp/project-ref || -n "${SUPABASE_ACCESS_TOKEN:-}" ]] && { echo "ERROR: proyecto remoto enlazado o token presente; solo stack local"; exit 2; }
KEY="${SMOKE_WOMPI_PUBLIC_KEY:-$(grep -E '^VITE_WOMPI_PUBLIC_KEY=' config/env/local-ci.env | cut -d= -f2-)}"
fail=0
cleanup() { pkill -f "vite preview --port $PORT" >/dev/null 2>&1; rm -f "$OUT"; rm -rf apps/web/dist; "$SB" stop --no-backup >/dev/null 2>&1; }
trap cleanup EXIT

echo "== 1. stack local"; "$SB" start -x "$EXCLUDE" >/dev/null 2>&1 || { echo "ERROR: supabase start falló"; exit 1; }
API=$("$SB" status -o json 2>/dev/null | python3 -c 'import json,sys,re;print(json.loads(re.search(r"\{.*\}",sys.stdin.read(),re.S).group(0))["API_URL"])')

echo "== 2. generación sin llave de Wompi (se espera exit 3: paso pendiente del usuario)"
env -u VITE_WOMPI_PUBLIC_KEY bash scripts/env/gen_local_env.sh; rc=$?
[[ $rc -eq 3 && -f "$OUT" ]] && echo "   OK (exit 3, archivo generado con VITE_WOMPI_PUBLIC_KEY vacía)" || { echo "   FALLO (exit $rc)"; fail=1; }
bash scripts/env/gen_local_env.sh >/dev/null 2>&1; rc=$?
[[ $rc -eq 4 ]] && echo "   OK: una segunda ejecución no sobrescribe (exit 4)" || { echo "   FALLO: segunda ejecución exit $rc"; fail=1; }
rm -f "$OUT"

echo "== 3. generación con la llave sandbox aportada por el usuario (se espera exit 0)"
VITE_WOMPI_PUBLIC_KEY="$KEY" bash scripts/env/gen_local_env.sh; rc=$?
[[ $rc -eq 0 ]] || { echo "   FALLO (exit $rc)"; exit 1; }

echo "== 4. build de la fábrica con el entorno generado (guarda T2)"
env -u VITE_APP_ENV -u VITE_SUPABASE_URL -u VITE_SUPABASE_ANON_KEY -u VITE_WOMPI_PUBLIC_KEY -u VITE_WOMPI_ENV \
  pnpm -s build:factory > /tmp/jm_smoke_build.log 2>&1 || { echo "   FALLO del build"; tail -5 /tmp/jm_smoke_build.log; exit 1; }
grep "Guarda de entorno" /tmp/jm_smoke_build.log; rm -f /tmp/jm_smoke_build.log

echo "== 5. sonda REST con la llave generada (debe responder 200 a una consulta válida)"
ANON=$(grep -E '^VITE_SUPABASE_ANON_KEY=' "$OUT" | cut -d= -f2-)
code=$(curl -s -o /dev/null -w '%{http_code}' "$API/rest/v1/products?select=id&limit=1" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"); unset ANON
[[ "$code" == 200 ]] && echo "   OK (HTTP 200)" || { echo "   FALLO (HTTP $code)"; fail=1; }

echo "== 6. navegador"
(cd apps/web && npx --no-install vite preview --port "$PORT" --strictPort >/dev/null 2>&1 &)
for _ in $(seq 1 40); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 0.5; done
NODE_PATH="${NODE_PATH:-$(npm root -g)}" node scripts/env/smoke_browser.cjs "http://127.0.0.1:$PORT/" "$API" || fail=1
[[ $fail -eq 0 ]] && echo "== PRUEBA DE HUMO: OK" || echo "== PRUEBA DE HUMO: FALLO"
exit $fail
