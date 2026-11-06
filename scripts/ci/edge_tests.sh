#!/usr/bin/env bash
# Pruebas de seguridad de la Edge Function wompi-webhook (Deno, Supabase simulado con import map).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT/apps/web/scripts"
DENO="${DENO_BIN:-deno}"
if ! command -v "$DENO" >/dev/null 2>&1; then
  echo "ERROR: deno no disponible (defina DENO_BIN o instale Deno 2.x)"; exit 2
fi
"$DENO" --version | head -1
"$DENO" run --allow-env --allow-read --import-map=import-map-deno.json test-edge-security.ts
# M26-T3/T7: configuración de la Edge Function (sin red ni archivos; solo variables de entorno ficticias)
"$DENO" run --allow-env test-edge-config.ts
