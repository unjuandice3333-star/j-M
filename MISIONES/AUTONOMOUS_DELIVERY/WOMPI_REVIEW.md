# Revisión de la integración Wompi (M34) — solo lectura de código y pruebas existentes

Pruebas ejecutadas hoy: `test-webhook-security.mjs` **13/13** (handlers reales con la BD simulada). En CI, `db-supabase`
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
| Observaciones menores (no bloqueantes) | (a) el webhook no comprueba la antigüedad del `timestamp` (mitigado por la idempotencia); (b) `/api/wompi/signature` responde CORS `*` y no tiene límite de tasa propio (acotado por token UUID y límite de intentos en BD) — candidatos a endurecer después de la aceptación |

## Intervención del propietario (sin pegar secretos en el chat)
1. Wompi **Sandbox**: llave pública `pub_test_…`, secreto de integridad y secreto de eventos → variables del entorno **Preview** de Vercel (ver `OWNER_STEPS.md`).
2. Panel sandbox de Wompi: URL de eventos `https://<preview>/api/wompi/webhook`.
3. Con eso, ejecutar `CASE=approved|declined|error node apps/web/e2e/wompi_sandbox.cjs` (necesita URL del Preview y llaves de QA).
