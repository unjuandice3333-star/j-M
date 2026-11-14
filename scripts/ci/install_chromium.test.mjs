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
    ...extra,
  };
  const r = spawnSync('bash', [SCRIPT], { env, encoding: 'utf8', timeout: 60000 });
  return { ...r, dir };
}

test('instala a la primera y deja timeouts de apt', () => {
  const r = run('true');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Chromium instalado \(intento 1\)/);
  assert.match(readFileSync(join(r.dir, '99-ci-timeouts'), 'utf8'), /Acquire::http::Timeout "30"/);
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
