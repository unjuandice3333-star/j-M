// Saneado de artefactos de Playwright (M36.2.1): las trazas (.zip) registran la cabecera `Cookie` de cada petición, así que con
// el bypass de Vercel activo contendrían la cookie `_vercel_jwt`. Este módulo reescribe los zip sustituyendo la cookie (y el
// secreto de bypass, por si acaso) por «<redactado>», sin dependencias (zlib de Node) y sin tocar el resto de entradas.
import { readFileSync, writeFileSync, renameSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const EOCD = 0x06054b50; const CEN = 0x02014b50; const LOC = 0x04034b50;
const TEXT_ENTRY = /\.(trace|network|stacks|json|txt|md|html|log|js|css)$/i;
export const PLACEHOLDER = '<redactado>';

/** Lee un zip (sin zip64) → [{ name, method, flags, time, date, crc, csize, usize, raw }]. */
export function readZip(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== EOCD) e--;
  if (e < 0) throw new Error('no es un zip válido (sin registro EOCD)');
  const count = buf.readUInt16LE(e + 10); let off = buf.readUInt32LE(e + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== CEN) throw new Error('directorio central corrupto');
    const flags = buf.readUInt16LE(off + 8); const method = buf.readUInt16LE(off + 10);
    const time = buf.readUInt16LE(off + 12); const date = buf.readUInt16LE(off + 14);
    const crc = buf.readUInt32LE(off + 16); const csize = buf.readUInt32LE(off + 20); const usize = buf.readUInt32LE(off + 24);
    const nlen = buf.readUInt16LE(off + 28); const xlen = buf.readUInt16LE(off + 30); const clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nlen);
    if (buf.readUInt32LE(lho) !== LOC) throw new Error('cabecera local corrupta');
    const dstart = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    entries.push({ name, method, flags, time, date, crc, csize, usize, raw: buf.subarray(dstart, dstart + csize) });
    off += 46 + nlen + xlen + clen;
  }
  return entries;
}

export function inflateEntry(en) {
  if (en.method === 0) return Buffer.from(en.raw);
  if (en.method === 8) return zlib.inflateRawSync(en.raw);
  throw new Error(`método de compresión no soportado (${en.method}) en ${en.name}`);
}

/** Escribe un zip desde entradas { name, method, flags, time, date, crc, csize, usize, raw }. */
export function writeZip(entries) {
  const parts = []; const central = []; let offset = 0;
  for (const en of entries) {
    const name = Buffer.from(en.name, 'utf8');
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(LOC, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE((en.flags | 0x0800) & ~0x0008, 6); lh.writeUInt16LE(en.method, 8);
    lh.writeUInt16LE(en.time, 10); lh.writeUInt16LE(en.date, 12); lh.writeUInt32LE(en.crc >>> 0, 14);
    lh.writeUInt32LE(en.csize, 18); lh.writeUInt32LE(en.usize, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    parts.push(lh, name, en.raw);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(CEN, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE((en.flags | 0x0800) & ~0x0008, 8); ch.writeUInt16LE(en.method, 10);
    ch.writeUInt16LE(en.time, 12); ch.writeUInt16LE(en.date, 14); ch.writeUInt32LE(en.crc >>> 0, 16); ch.writeUInt32LE(en.csize, 20); ch.writeUInt32LE(en.usize, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += 30 + name.length + en.raw.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(EOCD, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

/** Texto sin cookies ni secretos: `needles` literales y cualquier valor de `_vercel_jwt=`. */
export function scrubText(text, needles = []) {
  let out = text;
  for (const n of needles) if (n) out = out.split(n).join(PLACEHOLDER);
  return out.replace(/(_vercel_jwt=)[^;"'\\\s]+/g, `$1${PLACEHOLDER}`);
}

/** Sanea un zip en el lugar (escritura atómica). Devuelve cuántas entradas se modificaron. */
export function scrubZipFile(file, needles = []) {
  const entries = readZip(readFileSync(file));
  let changed = 0;
  const out = entries.map((en) => {
    if (!TEXT_ENTRY.test(en.name)) return en;
    const data = inflateEntry(en);
    const txt = data.toString('utf8');
    const clean = scrubText(txt, needles);
    if (clean === txt) return en;
    changed++;
    const buf = Buffer.from(clean, 'utf8');
    const raw = zlib.deflateRawSync(buf, { level: 6 });
    return { ...en, method: 8, crc: zlib.crc32(buf), csize: raw.length, usize: buf.length, raw };
  });
  if (changed) { const tmp = `${file}.${process.pid}.tmp`; writeFileSync(tmp, writeZip(out)); renameSync(tmp, file); }
  return changed;
}

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const n of readdirSync(dir)) { const p = path.join(dir, n); if (statSync(p).isDirectory()) yield* walk(p); else yield p; }
}

/** ¿Queda algún needle (o cookie _vercel_jwt con valor) en el zip? Devuelve la lista de entradas que lo contienen. */
export function findLeaksInZip(file, needles = []) {
  const bad = [];
  for (const en of readZip(readFileSync(file))) {
    if (!TEXT_ENTRY.test(en.name)) continue;
    const t = inflateEntry(en).toString('utf8');
    if (needles.some((n) => n && t.includes(n)) || /_vercel_jwt=(?!<redactado>)[^;"'\\\s]+/.test(t)) bad.push(en.name);
  }
  return bad;
}

/** Sanea todos los .zip bajo `dirs` y comprueba que no queda nada. Devuelve { zips, entries, leaks }. */
export function scrubDirs(dirs, needles = []) {
  let zips = 0; let entries = 0; const leaks = [];
  for (const d of dirs) for (const f of walk(d)) {
    if (!f.endsWith('.zip')) continue;
    zips++;
    try { entries += scrubZipFile(f, needles); const left = findLeaksInZip(f, needles); if (left.length) leaks.push(`${f}: ${left.join(', ')}`); }
    catch (e) { leaks.push(`${f}: no se pudo sanear (${e.message})`); }
  }
  return { zips, entries, leaks };
}
