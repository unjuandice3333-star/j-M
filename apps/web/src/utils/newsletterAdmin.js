// Utilidades puras del admin del boletín (ejecución 69): filtro, resumen y CSV.

export const isActiveSubscriber = (s) => !s.unsubscribed_at;

/** status: 'activos' | 'bajas' | 'todos'. Búsqueda sin distinguir mayúsculas en correo y origen. */
export function filterSubscribers(rows, query = '', status = 'activos') {
  const q = String(query).trim().toLowerCase();
  return (rows ?? []).filter((s) => (status === 'todos' || (status === 'activos') === isActiveSubscriber(s))
    && (!q || [s.email, s.source].some((v) => String(v ?? '').toLowerCase().includes(q))));
}

export function summarizeSubscribers(rows) {
  const active = (rows ?? []).filter(isActiveSubscriber).length;
  return { total: (rows ?? []).length, active, unsubscribed: (rows ?? []).length - active };
}

// Celdas que Excel/Sheets interpretarían como fórmula (inyección CSV): se anteponen con apóstrofo.
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value) {
  let s = value == null ? '' : String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV (separador coma, CRLF) con BOM para que Excel abra bien los acentos. */
export function subscribersToCsv(rows) {
  const header = ['correo', 'estado', 'origen', 'suscrito', 'baja', 'cuenta'];
  const lines = (rows ?? []).map((s) => [
    s.email, isActiveSubscriber(s) ? 'activo' : 'baja', s.source, s.subscribed_at ?? '', s.unsubscribed_at ?? '', s.user_id ? 'sí' : 'no',
  ].map(csvCell).join(','));
  return `\uFEFF${[header.join(','), ...lines].join('\r\n')}\r\n`;
}

export function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
