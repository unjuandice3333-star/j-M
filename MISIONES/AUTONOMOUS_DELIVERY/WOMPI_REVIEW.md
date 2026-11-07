# Revisión de la integración Wompi (M34) — solo lectura de código y pruebas existentes

Pruebas ejecutadas hoy: `test-webhook-security.mjs` **16/16** (13 + 3 nuevas de timestamp) (handlers reales con la BD simulada). En CI, `db-supabase`
ejecuta además `test-payment-flow.mjs` (handlers reales `/api/wompi/*` contra Supabase local, sin mocks, con secretos
ficticios generados en ejecución). **Wompi Sandbox real: NO probado** (faltan credenciales). Ningún pago real.

| Área | Resultado de la revisión |
|---|---|
| Firma de integridad (`api/wompi/signature.js`) | Fórmula oficial SHA-256(referencia + monto + moneda + secreto). Referencia y monto los fija la BD (`create_payment_attempt`), no el navegador. Valida UUID de pedido y token público |
| Creación de la transacción | Widget con la llave pública; el intento queda registrado con número de intento; la BD limita intentos y ventana de pago (errores 404/409/410/429 con mensajes claros) |
| Webhook (`api/wompi/webhook.js`) | Exige estructura de firma, propiedades mínimas firmadas (`transaction.id/status/amount_in_cents`), checksum SHA-256 comparado en tiempo constante; 401/400 si falla |
| Idempotencia | `apply_payment_event` registra el evento por checksum; un evento repetido no se aplica dos veces (prueba 7 del webhook y flujo de CI) |
| Rechazos y errores | DECLINED/ERROR: el pedido sigue pendiente y se puede reintentar; monto/moneda distintos → 422; referencia desconocida → 404; id de transacción reutilizado → 409; fallo de BD → 500 (Wompi reintenta) |
| Secretos | Solo en variables de servidor validadas por `serverConfig.js`; ninguna aparece en `apps/web/src`; los logs no imprimen valores; guarda de despliegue impide `production` en Preview |
| Mejora 1 (M35) · antigüedad del `timestamp` | Implementada en `api/_lib/eventFreshness.js` y aplicada en el webhook DESPUÉS de verificar la firma. Rechaza (400) timestamps inválidos, del futuro más allá de 5 min (tolerancia de reloj) o de más de 72 h. Compatibilidad: Wompi reintenta eventos no confirmados reenviando el MISMO payload horas después, así que una ventana corta rechazaría reintentos legítimos; 72 h cubre el horizonte de reintentos. Acepta segundos (formato de Wompi) y milisegundos. La idempotencia por checksum sigue siendo la defensa principal. 3 escenarios nuevos en `test-webhook-security.mjs` (16/16) + 3 pruebas unitarias |
| Mejora 2 (M35) · abuso de `/api/wompi/signature` | Implementada en `api/_lib/rateLimit.js`: ventana deslizante en memoria, 6 solicitudes/min por pedido y 30/min por IP (`x-forwarded-for`), respuesta 429 con `Retry-After`; los parámetros inválidos (400) se rechazan antes de consumir cupo. LIMITACIÓN: es por instancia serverless (mejor esfuerzo contra ráfagas); el control duradero sigue siendo el límite de intentos y la ventana de pago de la BD. Un límite global exigiría almacenamiento compartido (p. ej. Redis/Upstash), no incluido. 4 pruebas con el handler real |
| Observación pendiente | `/api/wompi/signature` mantiene CORS `*` (el navegador de la tienda lo llama desde su propio origen; restringirlo al dominio del Preview/Production requiere conocer ese dominio: decisión del propietario) |

## Intervención del propietario (sin pegar secretos en el chat)
1. Wompi **Sandbox**: llave pública `pub_test_…`, secreto de integridad y secreto de eventos → variables del entorno **Preview** de Vercel (ver `OWNER_STEPS.md`).
2. Panel sandbox de Wompi: URL de eventos `https://<preview>/api/wompi/webhook`.
3. Con eso, ejecutar `CASE=approved|declined|error node apps/web/e2e/wompi_sandbox.cjs` (necesita URL del Preview y llaves de QA).
