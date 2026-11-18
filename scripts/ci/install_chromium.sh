#!/usr/bin/env bash
# Instala Chromium de Playwright (y sus dependencias del sistema) con límite de tiempo y reintentos.
# Motivo (D117): en el run `ci` nº 171 `playwright install --with-deps` se quedó colgado en `apt-get update`
# (espejo de Ubuntu sin responder) hasta agotar los 15 min del job, sin ejecutar ninguna prueba.
# D146: en el run `ci` nº 257 el intento 1 venció con un espejo lento; `timeout` mató a Playwright pero su `apt-get`
# (lanzado con sudo, como root) siguió vivo con el candado de dpkg y los intentos 2 y 3 fallaron al instante
# («Could not get lock /var/lib/dpkg/lock-frontend»). Ahora apt espera el candado y, antes de reintentar, se espera
# (con límite) a que no quede ningún apt/dpkg del intento anterior.
# D147: en los runs `ci` nº 262, 264 y 265 el paso tardó 136–156 s, y casi todo era apt descargando ~32 MB de FUENTES
# opcionales (fonts-freefont-ttf, fonts-wqy-zenhei, …) a ~300 kB/s; la imagen ubuntu-24.04 ya trae todas las librerías
# que Chromium necesita («is already the newest version») y el navegador baja en ~6 s. Ahora se intenta primero SIN
# `--with-deps` y se comprueba que Chromium arranca de verdad; solo si falla se usa el camino con apt de siempre.
# Uso: install_chromium.sh            (en CI)
# Variables: CHROMIUM_INSTALL_ATTEMPTS (3), CHROMIUM_INSTALL_TIMEOUT (seg. por intento, 180), APT_CONF_DIR (/etc/apt/apt.conf.d),
#            APT_IDLE_WAIT (seg. máx. esperando a apt/dpkg huérfanos, 120), APT_BUSY_CMD (cómo detectarlos; para pruebas)
#            CHROMIUM_FAST_PATH (1; 0 = ir directo a --with-deps), CHROMIUM_FAST_CMD / CHROMIUM_CHECK_CMD (para pruebas)
# Salida: 0 instalado · 1 todos los intentos fallaron o vencieron.
set -uo pipefail
ATTEMPTS="${CHROMIUM_INSTALL_ATTEMPTS:-3}"
LIMIT="${CHROMIUM_INSTALL_TIMEOUT:-180}"
APT_CONF_DIR="${APT_CONF_DIR:-/etc/apt/apt.conf.d}"
INSTALL_CMD="${CHROMIUM_INSTALL_CMD:-npx --no-install playwright install --with-deps chromium}"
IDLE_WAIT="${APT_IDLE_WAIT:-120}"
BUSY_CMD="${APT_BUSY_CMD:-pgrep -x 'apt-get|apt|dpkg' >/dev/null}"
FAST_PATH="${CHROMIUM_FAST_PATH:-1}"
FAST_CMD="${CHROMIUM_FAST_CMD:-npx --no-install playwright install chromium}"
CHECK_CMD="${CHROMIUM_CHECK_CMD:-node -e \"require('playwright').chromium.launch().then((b) => b.close())\"}"

# Espera (máx. IDLE_WAIT s) a que termine cualquier apt/dpkg que haya quedado del intento anterior.
wait_apt_idle() {
  local waited=0
  while bash -c "$BUSY_CMD"; do
    if (( waited >= IDLE_WAIT )); then echo "AVISO: apt/dpkg sigue ocupado tras ${IDLE_WAIT}s; se reintenta igualmente"; return 0; fi
    (( waited == 0 )) && echo "== apt/dpkg del intento anterior sigue activo; esperando a que libere el candado"
    sleep 2; waited=$((waited + 2))
  done
  (( waited > 0 )) && echo "== apt/dpkg libre tras ${waited}s"
  return 0
}

# apt: que una conexión muda falle en 30 s (y reintente) en vez de esperar indefinidamente.
if [[ -d "$APT_CONF_DIR" ]]; then
  conf='Acquire::http::Timeout "30"; Acquire::https::Timeout "30"; Acquire::Retries "3"; DPkg::Lock::Timeout "120";'
  if [[ -w "$APT_CONF_DIR" ]]; then
    printf '%s\n' "$conf" > "$APT_CONF_DIR/99-ci-timeouts"
  elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    printf '%s\n' "$conf" | sudo tee "$APT_CONF_DIR/99-ci-timeouts" >/dev/null
  fi
fi

# Camino rápido (D147): solo el navegador, sin apt; vale si Chromium arranca con las librerías de la imagen.
if [[ "$FAST_PATH" == "1" ]]; then
  echo "== Chromium de Playwright: camino rápido sin apt (límite ${LIMIT}s)"
  if timeout --kill-after=15 "$LIMIT" bash -c "$FAST_CMD"; then
    if timeout --kill-after=5 60 bash -c "$CHECK_CMD"; then
      echo "== Chromium instalado y arranca (camino rápido, sin apt)"; exit 0
    fi
    echo "AVISO: Chromium no arranca sin dependencias del sistema; se instala con --with-deps"
  else
    echo "AVISO: el camino rápido falló o venció; se instala con --with-deps"
  fi
fi

for ((i = 1; i <= ATTEMPTS; i++)); do
  echo "== Chromium de Playwright: intento $i/$ATTEMPTS (límite ${LIMIT}s)"
  # --kill-after: si el proceso ignora SIGTERM, se fuerza a los 15 s.
  timeout --kill-after=15 "$LIMIT" bash -c "$INSTALL_CMD"
  rc=$?
  if [[ $rc -eq 0 ]]; then echo "== Chromium instalado (intento $i)"; exit 0; fi
  if [[ $rc -eq 124 || $rc -eq 137 ]]; then echo "AVISO: intento $i venció a los ${LIMIT}s"; else echo "AVISO: intento $i falló (código $rc)"; fi
  if [[ $i -lt $ATTEMPTS ]]; then sleep $((i * 5)); wait_apt_idle; fi
done
echo "ERROR: no se pudo instalar Chromium tras $ATTEMPTS intentos (infraestructura: apt/descarga), no es un fallo de las pruebas"
exit 1
