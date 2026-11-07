import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { readZip, writeZip, inflateEntry, scrubText, scrubZipFile, scrubDirs, findLeaksInZip } from '../../e2e/playwright/scrubZip.js';

const COOKIE = ['cookie', 'de', 'sesion', 'abc123'].join('-');
const SECRET = ['secreto', 'de', 'bypass', 'xyz789'].join('-');
const dirs = [];
const tmp = () => { const d = mkdtempSync(path.join(tmpdir(), 'jm-scrub-')); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true }); });

/** Zip de prueba con entradas comprimidas (deflate) y una binaria almacenada. */
function makeZip(files) {
  return writeZip(Object.entries(files).map(([name, content]) => {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const stored = Buffer.isBuffer(content);
    const raw = stored ? buf : zlib.deflateRawSync(buf);
    return { name, method: stored ? 0 : 8, flags: 0, time: 0, date: 0x21, crc: zlib.crc32(buf), csize: raw.length, usize: buf.length, raw };
  }));
}
const content = (zipBuf, name) => inflateEntry(readZip(zipBuf).find((e) => e.name === name)).toString('utf8');

describe('scrubText', () => {
  it('sustituye valores literales y cualquier valor de _vercel_jwt=', () => {
    const t = `Cookie: _vercel_jwt=${COOKIE}; otra=1 y el secreto ${SECRET}`;
    const out = scrubText(t, [SECRET]);
    expect(out).not.toContain(COOKIE); expect(out).not.toContain(SECRET);
    expect(out).toContain('_vercel_jwt=<redactado>'); expect(out).toContain('otra=1');
  });
});

describe('scrubZipFile', () => {
  it('reescribe un zip válido: sanea las entradas con cookie/secreto y deja el resto idéntico', () => {
    const d = tmp(); const f = path.join(d, 'trace.zip');
    const png = Buffer.from([137, 80, 78, 71, 0, 1, 2, 3, 255]);
    writeFileSync(f, makeZip({
      '0-trace.network': `{"headers":[{"name":"Cookie","value":"_vercel_jwt=${COOKIE}"}]}\n{"otra":"linea"}\n`,
      '0-trace.trace': `{"url":"x","extra":"${SECRET}"}\n`,
      'limpio.json': '{"ok":true}',
      'resources/captura.png': png,
    }));
    const changed = scrubZipFile(f, [SECRET]);
    expect(changed).toBe(2);
    const out = readFileSync(f);
    expect(content(out, '0-trace.network')).toContain('_vercel_jwt=<redactado>');
    expect(content(out, '0-trace.network')).not.toContain(COOKIE);
    expect(content(out, '0-trace.trace')).not.toContain(SECRET);
    expect(content(out, 'limpio.json')).toBe('{"ok":true}');
    expect(readZip(out).find((e) => e.name === 'resources/captura.png').raw.equals(png)).toBe(true);
    expect(readZip(out).map((e) => e.name)).toEqual(['0-trace.network', '0-trace.trace', 'limpio.json', 'resources/captura.png']);
    expect(findLeaksInZip(f, [SECRET])).toEqual([]);
    // las líneas siguen siendo JSON válido
    for (const l of content(out, '0-trace.network').trim().split('\n')) expect(() => JSON.parse(l)).not.toThrow();
  });
  it('un zip sin rastros no se reescribe (mismos bytes)', () => {
    const d = tmp(); const f = path.join(d, 'a.zip'); const zip = makeZip({ 'a.json': '{"x":1}' });
    writeFileSync(f, zip);
    expect(scrubZipFile(f, [SECRET])).toBe(0);
    expect(readFileSync(f).equals(zip)).toBe(true);
  });
  it('findLeaksInZip detecta lo que queda sin sanear', () => {
    const d = tmp(); const f = path.join(d, 'a.zip');
    writeFileSync(f, makeZip({ 'x.network': `_vercel_jwt=${COOKIE}` }));
    expect(findLeaksInZip(f, [])).toEqual(['x.network']);
  });
  it('un archivo que no es zip da un error claro', () => {
    const d = tmp(); const f = path.join(d, 'no.zip'); writeFileSync(f, 'no soy un zip');
    expect(() => scrubZipFile(f, [])).toThrow(/no es un zip válido/);
  });
});

describe('scrubDirs', () => {
  it('recorre carpetas, sanea todos los zip y reporta rastros restantes o archivos ilegibles', () => {
    const d = tmp(); mkdirSync(path.join(d, 'a', 'b'), { recursive: true });
    writeFileSync(path.join(d, 'a', 'b', 'trace.zip'), makeZip({ 'n.network': `_vercel_jwt=${COOKIE}` }));
    writeFileSync(path.join(d, 'a', 'roto.zip'), 'basura');
    writeFileSync(path.join(d, 'a', 'nota.txt'), 'no es zip');
    const r = scrubDirs([d, path.join(d, 'no-existe')], []);
    expect(r.zips).toBe(2); expect(r.entries).toBe(1);
    expect(r.leaks.length).toBe(1); expect(r.leaks[0]).toMatch(/roto\.zip.*no se pudo sanear/);
  });
});
