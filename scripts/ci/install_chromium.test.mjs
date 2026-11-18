// Pruebas de scripts/ci/install_chromium.sh (D117): límite por intento, reintento y salida.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'install_chromium.sh');

function run(cmd, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'jm-chromium-'));
  const env = {
    PATH: process.env.PATH,
    APT_CONF_DIR: dir,
    CHROMIUM_INSTALL_CMD: cmd.replaceAll('$DIR', dir),
    CHROMIUM_INSTALL_ATTEMPTS: '3',
    CHROMIUM_INSTALL_TIMEOUT: '2',
    APT_BUSY_CMD: 'false',
    CHROMIUM_FAST_PATH: '0',
    ...extra,
  };
  const r = spawnSync('bash', [SCRIPT], { env, encoding: 'utf8', timeout: 60000 });
  return { ...r, dir };
}

test('instala a la primera y deja timeouts de apt', () => {
  const r = run('true');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Chromium instalado \(intento 1\)/);
  const conf = readFileSync(join(r.dir, '99-ci-timeouts'), 'utf8');
  assert.match(conf, /Acquire::http::Timeout "30"/);
  assert.match(conf, /DPkg::Lock::Timeout "120"/);
});

test('un intento colgado vence y el siguiente instala', () => {
  // 1.er intento: crea la marca y se cuelga; 2.º: la marca existe y termina bien.
  const r = run('if [ -f $DIR/m ]; then exit 0; else touch $DIR/m; sleep 30; fi');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /intento 1 venció a los 2s/);
  assert.match(r.stdout, /Chromium instalado \(intento 2\)/);
});

test('falla tras agotar los intentos e indica que es infraestructura', () => {
  const r = run('exit 7', { CHROMIUM_INSTALL_ATTEMPTS: '2' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /intento 1 falló \(código 7\)/);
  assert.match(r.stdout, /intento 2 falló \(código 7\)/);
  assert.match(r.stdout, /tras 2 intentos \(infraestructura/);
});

test('sin directorio de apt no rompe', () => {
  const r = run('true', { APT_CONF_DIR: '/nonexistent-jm' });
  assert.equal(r.status, 0);
  assert.equal(existsSync('/nonexistent-jm/99-ci-timeouts'), false);
});

test('D146: tras vencer, espera a que el apt huérfano libere el candado antes de reintentar', () => {
  // El intento 1 deja un «apt» ocupado (marca $DIR/busy) que se libera solo a los 10 s (después del vencimiento a los 2 s y la pausa de 5 s); el 2.º instala
  // únicamente si el candado ya está libre (como dpkg real), así que sin la espera fallaría. `setsid` imita al
  // apt-get lanzado con sudo, que escapa del grupo de procesos que mata `timeout`.
  const r = run(
    'if [ -f $DIR/m ]; then [ ! -f $DIR/busy ] || exit 100; exit 0; else touch $DIR/m $DIR/busy; setsid bash -c "sleep 10; rm -f $DIR/busy" >/dev/null 2>&1 & sleep 30; fi',
    { APT_BUSY_CMD: '[ -f "$APT_CONF_DIR/busy" ]', CHROMIUM_INSTALL_ATTEMPTS: '2' },
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /intento 1 venció/);
  assert.match(r.stdout, /esperando a que libere el candado/);
  assert.match(r.stdout, /apt\/dpkg libre tras \d+s/);
  assert.match(r.stdout, /Chromium instalado \(intento 2\)/);
});

test('D146: la espera por apt ocupado tiene límite y no bloquea el reintento', () => {
  const r = run('exit 7', { APT_BUSY_CMD: 'true', APT_IDLE_WAIT: '2', CHROMIUM_INSTALL_ATTEMPTS: '2' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /sigue ocupado tras 2s; se reintenta igualmente/);
  assert.match(r.stdout, /intento 2 falló \(código 7\)/);
});

test('D147: camino rápido sin apt cuando Chromium arranca', () => {
  const r = run('exit 9', { CHROMIUM_FAST_PATH: '1', CHROMIUM_FAST_CMD: 'true', CHROMIUM_CHECK_CMD: 'true' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /camino rápido, sin apt/);
  assert.doesNotMatch(r.stdout, /intento 1/);
});

test('D147: si Chromium no arranca sin dependencias, cae a --with-deps', () => {
  const r = run('true', { CHROMIUM_FAST_PATH: '1', CHROMIUM_FAST_CMD: 'true', CHROMIUM_CHECK_CMD: 'exit 1' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /no arranca sin dependencias/);
  assert.match(r.stdout, /Chromium instalado \(intento 1\)/);
});

test('D147: si la descarga rápida falla o vence, cae a --with-deps', () => {
  const r = run('true', { CHROMIUM_FAST_PATH: '1', CHROMIUM_FAST_CMD: 'sleep 30', CHROMIUM_CHECK_CMD: 'true' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /camino rápido falló o venció/);
  assert.match(r.stdout, /Chromium instalado \(intento 1\)/);
});
