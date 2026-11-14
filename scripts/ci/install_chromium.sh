#!/usr/bin/env bash
# Instala Chromium de Playwright (y sus dependencias del sistema) con límite de tiempo y reintentos.
# Motivo (D117): en el run `ci` nº 171 `playwright install --with-deps` se quedó colgado en `apt-get update`
# (espejo de Ubuntu sin responder) hasta agotar los 15 min del job, sin ejecutar ninguna prueba.
# Uso: install_chromium.sh            (en CI)
# Variables: CHROMIUM_INSTALL_ATTEMPTS (3), CHROMIUM_INSTALL_TIMEOUT (seg. por intento, 180), APT_CONF_DIR (/etc/apt/apt.conf.d)
# Salida: 0 instalado · 1 todos los intentos fallaron o vencieron.
set -uo pipefail
ATTEMPTS="${CHROMIUM_INSTALL_ATTEMPTS:-3}"
LIMIT="${CHROMIUM_INSTALL_TIMEOUT:-180}"
APT_CONF_DIR="${APT_CONF_DIR:-/etc/apt/apt.conf.d}"
INSTALL_CMD="${CHROMIUM_INSTALL_CMD:-npx --no-install playwright install --with-deps chromium}"

# apt: que una conexión muda falle en 30 s (y reintente) en vez de esperar indefinidamente.
if [[ -d "$APT_CONF_DIR" ]]; then
  conf='Acquire::http::Timeout "30"; Acquire::https::Timeout "30"; Acquire::Retries "3";'
  if [[ -w "$APT_CONF_DIR" ]]; then
    printf '%s\n' "$conf" > "$APT_CONF_DIR/99-ci-timeouts"
  elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    printf '%s\n' "$conf" | sudo tee "$APT_CONF_DIR/99-ci-timeouts" >/dev/null
  fi
fi

for ((i = 1; i <= ATTEMPTS; i++)); do
  echo "== Chromium de Playwright: intento $i/$ATTEMPTS (límite ${LIMIT}s)"
  # --kill-after: si el proceso ignora SIGTERM, se fuerza a los 15 s.
  timeout --kill-after=15 "$LIMIT" bash -c "$INSTALL_CMD"
  rc=$?
  if [[ $rc -eq 0 ]]; then echo "== Chromium instalado (intento $i)"; exit 0; fi
  if [[ $rc -eq 124 || $rc -eq 137 ]]; then echo "AVISO: intento $i venció a los ${LIMIT}s"; else echo "AVISO: intento $i falló (código $rc)"; fi
  [[ $i -lt $ATTEMPTS ]] && sleep $((i * 5))
done
echo "ERROR: no se pudo instalar Chromium tras $ATTEMPTS intentos (infraestructura: apt/descarga), no es un fallo de las pruebas"
exit 1
