// Utilidades locales de prueba: contraseña aleatoria por ejecución para usuarios seed vía la API admin de GoTrue LOCAL.
const fs = require('fs'); const crypto = require('crypto');
const st = JSON.parse(fs.readFileSync(process.env.STATUS_JSON, 'utf8'));
if (!String(st.API_URL).startsWith('http://127.0.0.1')) throw new Error('solo stack local');
async function setPassword(userId) {
  const pwd = 'E2e-' + crypto.randomBytes(9).toString('base64url');
  const r = await fetch(`${st.API_URL}/auth/v1/admin/users/${userId}`, { method: 'PUT', headers: { apikey: st.SERVICE_ROLE_KEY, Authorization: `Bearer ${st.SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pwd }) });
  if (!r.ok) throw new Error('no se pudo fijar la contraseña: ' + r.status);
  return pwd;
}
const ADMIN_ID = '00000000-0000-4000-8000-00000000a002';
const CLIENTE1_ID = '00000000-0000-4000-8000-00000000a003';
// PNG 32x40 gris (generado, sin dependencias)
function tinyPng() {
  const zlib = require('zlib'); const w = 32, h = 40;
  const raw = Buffer.alloc((w * 3 + 1) * h, 0); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; raw.fill(0x80, y * (w * 3 + 1) + 1, (y + 1) * (w * 3 + 1)); }
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const crc = Buffer.alloc(4); crc.writeUInt32BE(require('zlib').crc32 ? zlib.crc32(td) : crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function crc32(b) { let c, crc = 0xffffffff; for (let n = 0; n < b.length; n++) { c = (crc ^ b[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
module.exports = { st, setPassword, ADMIN_ID, CLIENTE1_ID, tinyPng };
