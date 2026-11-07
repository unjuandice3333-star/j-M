import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, statSync, existsSync, chmodSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { AUTH_STATE_FILE, WEB_DIR, validateStorageState, persistStorageState, readStorageState } from '../../e2e/playwright/authState.js';
import { cookiesFromSetCookie, verifyCookieAccess } from '../../e2e/playwright/vercelBypass.js';

const BASE = 'https://jym-web-git-mission-team.vercel.app';
const HOST = 'jym-web-git-mission-team.vercel.app';
const good = () => cookiesFromSetCookie(['_vercel_jwt=valor-de-cookie-1; Path=/; HttpOnly; Secure; SameSite=Lax'], BASE);
const dirs = [];
const tmp = () => { const d = mkdtempSync(path.join(tmpdir(), 'jm-authstate-')); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true }); });

describe('ruta del storage state (única, absoluta, independiente del cwd)', () => {
  it('es absoluta y apunta a apps/web/.auth/vercel.json', () => {
    expect(path.isAbsolute(AUTH_STATE_FILE)).toBe(true);
    expect(AUTH_STATE_FILE).toBe(path.join(WEB_DIR, '.auth', 'vercel.json'));
    expect(path.basename(WEB_DIR)).toBe('web');
  });
  it('es la misma ejecutando desde otro directorio de trabajo (como config.rootDir ≠ carpeta del config)', () => {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import('${new URL('../../e2e/playwright/authState.js', import.meta.url).href}').then((m) => console.log(m.AUTH_STATE_FILE))`], { cwd: tmpdir(), encoding: 'utf8' });
    expect(r.stdout.trim()).toBe(AUTH_STATE_FILE);
  });
});

describe('cookiesFromSetCookie: formato de Playwright', () => {
  it('siempre incluye expires numérico (-1 si es de sesión) y dominio exacto', () => {
    const [c] = cookiesFromSetCookie(['_vercel_jwt=abc; Path=/; HttpOnly'], BASE);
    expect(c.expires).toBe(-1); expect(c.domain).toBe(HOST);
    const [d] = cookiesFromSetCookie(['_vercel_jwt=abc; Max-Age=60'], BASE);
    expect(d.expires).toBeGreaterThan(Date.now() / 1000);
  });
});

describe('validateStorageState', () => {
  const st = () => ({ cookies: good(), origins: [] });
  it('acepta un estado correcto', () => expect(validateStorageState(st(), BASE)).toEqual([]));
  it.each([
    ['sin cookies', { cookies: [], origins: [] }, /vacío/],
    ['sin origins', { cookies: good() }, /origins/],
    ['no es objeto', [], /no es un objeto/],
  ])('rechaza %s', (_n, s, re) => expect(validateStorageState(s, BASE).join(' ')).toMatch(re));
  it('rechaza una cookie de otro dominio (o con punto inicial) y cookies sin _vercel_jwt', () => {
    const other = { ...good()[0], domain: 'fonts.gstatic.com' };
    expect(validateStorageState({ cookies: [other], origins: [] }, BASE).join(' ')).toMatch(/no es el dominio exacto/);
    expect(validateStorageState({ cookies: [{ ...good()[0], domain: `.${HOST}` }], origins: [] }, BASE).join(' ')).toMatch(/dominio exacto/);
    expect(validateStorageState({ cookies: [{ ...good()[0], name: 'otra' }], origins: [] }, BASE).join(' ')).toMatch(/_vercel_jwt/);
  });
  it('rechaza campos que Playwright exige (expires, sameSite, secure en https, value vacío)', () => {
    const c = good()[0]; const { expires: _e, ...sinExpires } = c;
    expect(validateStorageState({ cookies: [sinExpires], origins: [] }, BASE).join(' ')).toMatch(/expires/);
    expect(validateStorageState({ cookies: [{ ...c, sameSite: 'x' }], origins: [] }, BASE).join(' ')).toMatch(/sameSite/);
    expect(validateStorageState({ cookies: [{ ...c, secure: false }], origins: [] }, BASE).join(' ')).toMatch(/secure/);
    expect(validateStorageState({ cookies: [{ ...c, value: '' }], origins: [] }, BASE).join(' ')).toMatch(/value vacío/);
  });
});

describe('persistStorageState / readStorageState', () => {
  it('crea la carpeta de forma recursiva, escribe el archivo y lo relee válido', () => {
    const file = path.join(tmp(), 'a', 'b', '.auth', 'vercel.json');
    const r = persistStorageState({ file, cookies: good(), baseURL: BASE });
    expect(r).toEqual({ file, cookies: 1 });
    expect(existsSync(file)).toBe(true);
    expect(readStorageState(file, BASE).ok).toBe(true);
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    expect(Object.keys(parsed).sort()).toEqual(['cookies', 'origins']);
    expect(parsed.origins).toEqual([]);
  });
  it.skipIf(process.platform === 'win32')('el archivo queda con permisos 0600 y se rechaza si se abre', () => {
    const file = path.join(tmp(), 'v.json');
    persistStorageState({ file, cookies: good(), baseURL: BASE });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    chmodSync(file, 0o644);
    expect(readStorageState(file, BASE).errors.join(' ')).toMatch(/permisos/);
  });
  it('NO crea un estado vacío ni inventa cookies: sin cookies lanza y no deja archivo', () => {
    const file = path.join(tmp(), 'v.json');
    expect(() => persistStorageState({ file, cookies: [], baseURL: BASE })).toThrow(/vacío/);
    expect(existsSync(file)).toBe(false);
  });
  it('no deja archivos temporales y sobrescribe un estado anterior', () => {
    const d = tmp(); const file = path.join(d, 'v.json');
    persistStorageState({ file, cookies: good(), baseURL: BASE });
    persistStorageState({ file, cookies: cookiesFromSetCookie(['_vercel_jwt=otro; Path=/; Secure'], BASE), baseURL: BASE });
    expect(JSON.parse(readFileSync(file, 'utf8')).cookies[0].value).toBe('otro');
    expect(readdirSync(d).sort()).toEqual(['v.json']);
  });
  it('un fallo de escritura da un mensaje claro con la ruta (carpeta imposible de crear)', () => {
    const d = tmp(); const blocker = path.join(d, 'archivo'); writeFileSync(blocker, 'x');
    expect(() => persistStorageState({ file: path.join(blocker, '.auth', 'v.json'), cookies: good(), baseURL: BASE })).toThrow(/No se pudo persistir el storage state de Vercel en/);
  });
  it('readStorageState explica: no existe, vacío, JSON inválido, estructura inválida', () => {
    const d = tmp(); const f = path.join(d, 'v.json');
    expect(readStorageState(f, BASE).errors[0]).toMatch(/no existe/);
    writeFileSync(f, '', { mode: 0o600 }); expect(readStorageState(f, BASE).errors[0]).toMatch(/vacío/);
    writeFileSync(f, '{no json', { mode: 0o600 }); expect(readStorageState(f, BASE).errors[0]).toMatch(/JSON/);
    writeFileSync(f, JSON.stringify({ cookies: [], origins: [] }), { mode: 0o600 }); expect(readStorageState(f, BASE).ok).toBe(false);
  });
  it('el archivo contiene solo la cookie recibida (nunca el secreto de bypass)', () => {
    const secret = ['valor', 'del', 'secreto'].join('-');
    const file = path.join(tmp(), 'v.json');
    persistStorageState({ file, cookies: good(), baseURL: BASE });
    expect(readFileSync(file, 'utf8')).not.toContain(secret);
  });
});

describe('verifyCookieAccess (acceso solo con la cookie)', () => {
  const jar = () => good();
  it('ok si el deployment responde < 400 con la cookie; envía únicamente la cabecera Cookie', async () => {
    let seen;
    const r = await verifyCookieAccess({ baseURL: BASE, cookies: jar(), fetchImpl: async (u, o) => { seen = o.headers; return { status: 200 }; } });
    expect(r).toMatchObject({ ok: true, status: 200 });
    expect(Object.keys(seen)).toEqual(['cookie']);
  });
  it('falla con mensaje claro si el deployment responde 401/403 con la cookie', async () => {
    const r = await verifyCookieAccess({ baseURL: BASE, cookies: jar(), fetchImpl: async () => ({ status: 401 }) });
    expect(r.ok).toBe(false); expect(r.reason).toMatch(/no autoriza el acceso/);
    expect(JSON.stringify(r)).not.toContain('valor-de-cookie-1');
  });
});

