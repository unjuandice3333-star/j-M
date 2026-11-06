// =============================================================================
// M27 — Solo desarrollo local (`vite` / `pnpm --filter @jm/web dev`): sirve las funciones de apps/web/api/** con el
// mismo código que ejecuta Vercel, para probar el checkout completo sin `vercel dev` (la fábrica no se conecta a
// Vercel). No interviene en `vite build` ni en producción (apply: 'serve').
//
// Las variables de SERVIDOR (APP_ENV, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WOMPI_*) se leen de process.env del
// proceso de Vite: nunca de archivos .env del navegador. Si faltan, las funciones responden 500 con su propio
// mensaje de configuración (serverConfig.js), igual que en Vercel.
// =============================================================================
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROUTES = { '/api/wompi/signature': 'api/wompi/signature.js', '/api/wompi/webhook': 'api/wompi/webhook.js' };
const MAX_BODY = 1024 * 1024;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('cuerpo demasiado grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { resolve(null); } });
    req.on('error', reject);
  });
}

/** Adaptador mínimo de la interfaz de Vercel (req.body, res.status().json()). */
function vercelRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
  return res;
}

export function apiDevPlugin(webRoot) {
  return {
    name: 'jm-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const route = ROUTES[(req.url || '').split('?')[0]];
        if (!route) return next();
        try {
          req.body = req.method === 'POST' ? await readJson(req) : undefined;
          const mod = await import(`${pathToFileURL(path.join(webRoot, route)).href}?t=${Date.now()}`);
          await mod.default(req, vercelRes(res));
        } catch (e) {
          console.error('[api-dev]', e.message);
          if (!res.headersSent) vercelRes(res).status(500).json({ error: 'Error interno de la función local.' });
        }
      });
    },
  };
}
