// Deployment PROTEGIDO simulado (M36.2.1), solo para probar el flujo de bypass de Playwright sin Vercel real.
// Imita Deployment Protection: sin cookie ni secreto → 401 «Authentication Required»; con el secreto en
// `x-vercel-protection-bypass` → emite la cookie `_vercel_jwt`; con la cookie → hace de proxy hacia la tienda local.
// Cuenta cuántas peticiones llevaron la cabecera de bypass (debe ser 1: la de Node; el navegador nunca la envía).
const http = require('http');
const crypto = require('crypto');

function start({ port, secret, upstream }) {
  const token = crypto.randomBytes(16).toString('hex');
  const stats = { withBypassHeader: 0, withCookie: 0, rejected: 0, cookiesIssued: 0 };
  const up = new URL(upstream);
  const server = http.createServer((req, res) => {
    if (req.url === '/__fake-vercel/stats') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(stats)); }
    const headers = { ...req.headers, host: up.host };
    const extra = {};
    const bypass = req.headers['x-vercel-protection-bypass'];
    const hasCookie = (req.headers.cookie || '').split(/;\s*/).includes(`_vercel_jwt=${token}`);
    if (bypass !== undefined) stats.withBypassHeader++;
    if (bypass === secret) { extra['set-cookie'] = `_vercel_jwt=${token}; Path=/; HttpOnly; Max-Age=3600; SameSite=Lax`; stats.cookiesIssued++; }
    else if (hasCookie) stats.withCookie++;
    else { stats.rejected++; res.writeHead(401, { 'content-type': 'text/html' }); return res.end('<html><head><title>Authentication Required</title></head><body>Vercel Authentication</body></html>'); }
    delete headers['x-vercel-protection-bypass']; delete headers['x-vercel-set-bypass-cookie'];
    const pr = http.request({ host: up.hostname, port: up.port, path: req.url, method: req.method, headers }, (ur) => { res.writeHead(ur.statusCode, { ...ur.headers, ...extra }); ur.pipe(res); });
    pr.on('error', () => { res.writeHead(502); res.end('upstream caído'); });
    req.pipe(pr);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, stats, close: () => new Promise((r) => server.close(r)) })));
}
module.exports = { start };
