#!/usr/bin/env bash
# Build de producción del frontend + verificación de que el bundle del navegador no contiene secretos.
#  a) nombres de secretos de servidor (referencias accidentales);
#  b) VALORES: Vite inyecta valores, no nombres → se decodifica todo JWT del bundle y se rechaza role=service_role,
#     y se ejecuta gitleaks sobre dist/ SIN la allowlist del repositorio.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
source "$ROOT/scripts/ci/lib/gitleaks.sh"
# M26-T2: entorno de build de la fábrica (público, ficticio, perfil local) y guarda ANTES de vite build.
FACTORY_ENV_FILE="${FACTORY_ENV_FILE:-$ROOT/config/env/local-ci.env}"
set -a; source "$FACTORY_ENV_FILE"; set +a
node "$ROOT/scripts/env/check_env.mjs"
pnpm --filter @jm/web build
DIST="apps/web/dist"
test -f "$DIST/index.html" || { echo "ERROR: no se generó $DIST/index.html"; exit 1; }

if grep -rIlE "SUPABASE_SERVICE_ROLE_KEY|WOMPI_INTEGRITY_SECRET|WOMPI_EVENTS_SECRET|sb_secret_|prod_integrity_|prod_events_" "$DIST"; then
  echo "ERROR: el bundle de producción contiene referencias a secretos de servidor"; exit 1
fi

python3 -I - "$DIST" <<'PY'
import base64, json, os, re, sys
bad = []
for d, _, fs in os.walk(sys.argv[1]):
    for f in fs:
        p = os.path.join(d, f)
        try: txt = open(p, encoding="utf-8", errors="ignore").read()
        except OSError: continue
        for tok in re.findall(r"eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]+", txt):
            try: claims = json.loads(base64.urlsafe_b64decode(tok + "=" * (-len(tok) % 4)))
            except Exception: continue
            if str(claims.get("role", "")).lower() not in ("anon", ""):
                bad.append(f"{p}: JWT con role={claims.get('role')}")
if bad:
    print("ERROR: el bundle contiene JWT con privilegios:"); print("\n".join(bad)); sys.exit(1)
print("JWT en el bundle: ninguno con privilegios")
PY

# gitleaks sobre el bundle con las reglas por defecto (sin la allowlist que excluye dist/)
run_gitleaks dir --no-banner --redact --exit-code 1 "$DIST"; rc=$?
if [[ $rc -eq 1 ]]; then echo "ERROR: gitleaks detectó secretos en el bundle"; exit 1
elif [[ $rc -ne 0 ]]; then echo "ERROR: no se pudo ejecutar gitleaks sobre el bundle (rc=$rc); el bundle NO se ha verificado"; exit 2; fi
echo "build OK; bundle sin secretos de servidor ($(du -sh "$DIST" | cut -f1))"
