// Antigüedad del evento de Wompi (M35). `timestamp` es Unix en SEGUNDOS (docs de Wompi); se aceptan milisegundos por
// robustez. El checksum ya garantiza que lo firmó Wompi; esto acota la ventana de reutilización de un evento capturado.
// Compatibilidad: Wompi REINTENTA eventos no confirmados (hasta 3 veces, en horas) reenviando el MISMO payload, por lo que
// una ventana corta rechazaría reintentos legítimos. Por eso: tolerancia de reloj hacia el futuro de 5 min y antigüedad
// máxima de 72 h (más allá del horizonte de reintentos). La idempotencia por checksum en la BD sigue siendo la defensa
// principal contra repeticiones.
export const FUTURE_TOLERANCE_S = 300;
export const MAX_AGE_S = 72 * 3600;

/** @returns {null | 'invalid' | 'future' | 'too_old'} null = el evento es admisible */
export function eventTimestampProblem(timestamp, nowMs = Date.now()) {
  const n = typeof timestamp === 'string' && /^\d+$/.test(timestamp.trim()) ? Number(timestamp) : timestamp;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return 'invalid';
  const seconds = n > 1e11 ? n / 1000 : n; // milisegundos → segundos
  const age = nowMs / 1000 - seconds;
  if (age < -FUTURE_TOLERANCE_S) return 'future';
  if (age > MAX_AGE_S) return 'too_old';
  return null;
}
