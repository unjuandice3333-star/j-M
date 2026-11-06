#!/usr/bin/env bash
# Registra el commit probado y las versiones de herramientas (evidencia de CI).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${CI_OUT:-$ROOT/ci-artifacts}"; mkdir -p "$OUT"
v() { "$@" 2>/dev/null | head -1 || echo "no disponible"; }
{
  echo "commit=$(git -C "$ROOT" rev-parse HEAD)"
  echo "branch=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
  echo "tree_dirty=$(git -C "$ROOT" status --porcelain --untracked-files=all | grep -v '^?? ci-artifacts/' | wc -l | tr -d ' ')"
  echo "date_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "os=$(uname -srm)"
  echo "node=$(v node --version)"
  echo "pnpm=$(v pnpm --version)"
  echo "python=$(v python3 --version)"
  echo "postgres_local=$(v /usr/lib/postgresql/16/bin/postgres --version)"
  echo "pg_prove=$(v pg_prove --version)"
  echo "docker=$(v docker version --format '{{.Server.Version}}')"
  echo "supabase_cli=$(cd /tmp && v ${SUPABASE_BIN:-supabase} --version)"   # desde /tmp: la CLI escribe .temp/ en el cwd
  echo "deno=$(v ${DENO_BIN:-deno} --version)"
  echo "eslint=$(cd "$ROOT" && v npx --no-install eslint --version)"
  echo "typescript=$(cd "$ROOT" && v npx --no-install tsc --version)"
  echo "vitest=$(cd "$ROOT" && v npx --no-install vitest --version)"
  echo "gitleaks_image=zricethezav/gitleaks:v8.21.2@sha256:0e99e882…(fijada por digest)"
} | tee "$OUT/environment.txt"
