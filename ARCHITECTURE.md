# ARCHITECTURE.md — J&M FASHION STORE
## Arquitectura de Producción, Seguridad, Pagos e Inventario

### 1. Visión General
**J&M FASHION STORE** es una plataforma e-commerce de **MODA MASCULINA · COLOMBIA** construida sobre una arquitectura modular, escalable, atómica e idempotente.

```
CLIENTE (React 18 + Vite + Zustand)
    │
    ├─► Repositorio/Servicios (productService.js / wompi.js / analytics.js)
    │
    ├─► PostgreSQL / Supabase Cloud (RPC create_online_order_validated)
    │      ├─ Row Level Security (RLS)
    │      ├─ Bloqueo Atómico SELECT FOR UPDATE
    │      └─ Tablas Master & E-commerce (online_orders, inventory, coupons)
    │
    ├─► Wompi Colombia (Pasarela de Pago)
    │      ├─ Checkouts con SHA-256 Signatures
    │      └─ Webhook Server-to-Server (Supabase Edge Function: wompi-webhook)
    │
    └─► Analítica E-commerce (GA4 + Meta Pixel)
```

---

### 2. Seguridad & Variables de Entorno

#### Clasificación de Credenciales
- **PÚBLICAS (Navegador Frontend)**:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_WOMPI_PUBLIC_KEY`

- **PRIVADAS / SERVIDOR (NUNCA EXPUESTAS EN BUNDLE JS)**:
  - `SUPABASE_SERVICE_ROLE_KEY` (Solo para Edge Functions y scripts de mantenimiento)
  - `WOMPI_INTEGRITY_SECRET` (Mantenido exclusivamente en PostgreSQL / Edge Functions)
  - `WOMPI_EVENTS_SECRET` (Utilizado para validar el checksum del Webhook de Wompi)

---

### 3. Integración de Pagos Wompi & Idempotencia

1. **Intención de Compra**:
   - El cliente envía la solicitud de compra desde el frontend.
   - La función RPC `create_online_order_validated` en PostgreSQL recalcula el subtotal, total, aplica cupones y descuenta inventario atómicamente con `SELECT FOR UPDATE`.
2. **Checkout Widget Wompi**:
   - El frontend recibe el ID de la orden validada y dispara el flujo de pago con la `WOMPI_PUBLIC_KEY`.
3. **Webhook de Confirmación (`wompi-webhook`)**:
   - La Supabase Edge Function recibe la notificación HTTP POST directa de Wompi.
   - Verifica la firma de integridad SHA-256 contra `WOMPI_EVENTS_SECRET`.
   - Consulta el estado previo en `payment_transactions` para garantizar **Idempotencia** (evita procesar pagos dobles o actualizar stock dos veces).
   - Actualiza el estado de la orden a `paid` y registra la transacción.

---

### 4. Flujo de Estados

#### Estados de Orden (`online_order_status`)
- `pending` → Orden creada en borrador.
- `payment_pending` → Esperando respuesta del cliente o pasarela.
- `paid` → Pago Aprobado y confirmado por Webhook.
- `processing` → Empacando prendas en bodega.
- `shipped` → Despachado por transportadora (Coordinadora/Servientrega).
- `delivered` → Entregado a satisfacción del cliente.
- `cancelled` → Pago rechazado o transacción anulada.
- `refunded` → Dinero reembolsado al cliente.

---

### 5. Guía de Despliegue en Producción

1. **Aplicar Migraciones SQL en Supabase Cloud**:
   ```bash
   npx supabase db push
   ```
2. **Desplegar Edge Function del Webhook de Wompi**:
   ```bash
   npx supabase functions deploy wompi-webhook --no-verify-jwt
   npx supabase secrets set WOMPI_EVENTS_SECRET="tu_secreto_de_eventos_wompi"
   ```
3. **Compilar Frontend en Vercel / Netlify**:
   ```bash
   pnpm --filter @jm/web build
   ```
