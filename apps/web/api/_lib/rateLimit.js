// Límite de tasa de ventana deslizante EN MEMORIA (M35), por instancia de función serverless. Es una defensa de mejor
// esfuerzo contra ráfagas: en Vercel cada instancia tiene su propio contador. El control duradero contra abuso de
// /api/wompi/signature es el límite de intentos por pedido y la ventana de pago que aplica la BD (create_payment_attempt).
export function createRateLimiter({ limit, windowMs, maxKeys = 5000, now = () => Date.now() }) {
  const hits = new Map(); // clave → marcas de tiempo dentro de la ventana
  return function check(key) {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (t - recent[0])) / 1000)) };
    }
    recent.push(t);
    hits.set(key, recent);
    if (hits.size > maxKeys) { // acotar la memoria: eliminar claves sin actividad en la ventana
      for (const [k, v] of hits) if (!v.some((x) => t - x < windowMs)) hits.delete(k);
      if (hits.size > maxKeys) hits.delete(hits.keys().next().value);
    }
    return { allowed: true, remaining: limit - recent.length };
  };
}

/** IP del cliente tras el proxy de Vercel (primera de x-forwarded-for) o la del socket. */
export function clientIp(req) {
  const xff = String(req.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim();
  return xff || req.socket?.remoteAddress || 'desconocida';
}
