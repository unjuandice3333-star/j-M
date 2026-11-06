#!/usr/bin/env bash
# M26-T5 — Genera apps/web/.env.local a partir del stack local de Supabase (`supabase status -o json`).
# Envoltorio del plan; la lógica (y sus pruebas) está en gen_local_env.mjs. Admite las mismas opciones.
# Requisitos: stack local arrancado (`supabase start`) y la CLI disponible (SUPABASE_BIN si no está en el PATH).
# Salida: 0 completo · 3 generado con pasos pendientes del usuario · 1 rechazado · 2 uso/lectura · 4 destino existente
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec node "$ROOT/scripts/env/gen_local_env.mjs" "$@"
