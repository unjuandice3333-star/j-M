// Global setup (M36.1): en el destino preview con secreto de bypass, obtiene la cookie de Vercel desde Node y la guarda
// como storageState (.auth/vercel.json, ignorado por git). Solo imprime estados, nunca el secreto ni la cookie.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fetchBypassCookies, redactSecrets } from './vercelBypass.js';

export default async function globalSetup(config) {
  const { target, baseURL } = config.metadata ?? {};
  if (target !== 'preview') return;
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!secret) { console.log('[bypass] sin VERCEL_AUTOMATION_BYPASS_SECRET: se prueba sin bypass (válido solo si el deployment no está protegido)'); return; }
  const r = await fetchBypassCookies({ baseURL, secret });
  const summary = `[bypass] HTTP ${r.status} · cookie de Vercel: ${r.hasVercelCookie ? 'obtenida' : 'NO obtenida'}${r.reason ? ` · ${redactSecrets(r.reason, secret)}` : ''}`;
  console.log(summary);
  if (!r.ok || !r.hasVercelCookie) throw new Error(`Bypass de Vercel no disponible. ${redactSecrets(r.reason ?? '', secret)}`);
  const file = path.resolve(config.rootDir, '.auth', 'vercel.json');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ cookies: r.cookies, origins: [] }), { mode: 0o600 });
}
