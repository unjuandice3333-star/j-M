# J&M FASHION STORE — LAUNCH CHECKLIST & DEPLOYMENT GUIDE
## MODA MASCULINA · COLOMBIA

---

### 1. CHECKLIST DE INFRAESTRUCTURA Y DESPLIEGUE

#### A. Base de Datos Supabase (PostgreSQL)
- [ ] Aplicar la migración inicial: `supabase/migrations/20260508000000_init_schema.sql`
- [ ] Aplicar la migración de seguridad: `supabase/migrations/20260508010000_security_hardening.sql`
- [ ] Aplicar la migración de e-commerce: `supabase/migrations/20260927000000_ecommerce_expansion.sql`
- [ ] Aplicar el hardening atómico y RLS: `supabase/migrations/20260927010000_security_wompi_hardening.sql`

```bash
# Comando de despliegue de migraciones en Supabase CLI:
npx supabase db push
```

#### B. Supabase Edge Functions (Webhook Server-to-Server Wompi)
- [ ] Desplegar la función Edge del Webhook de Wompi:
```bash
npx supabase functions deploy wompi-webhook --no-verify-jwt
```
- [ ] Configurar el secreto de eventos de Wompi en Supabase Cloud:
```bash
npx supabase secrets set WOMPI_EVENTS_SECRET="tu_secreto_de_eventos_wompi"
```

#### C. Variables de Entorno en Vercel (Frontend Client Bundle)
Configurar en la consola de Vercel (Project Settings > Environment Variables):
- `VITE_SUPABASE_URL` = `https://tu-proyecto.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = `eyJhbGci...`
- `VITE_WOMPI_PUBLIC_KEY` = `pub_prod_xxxxxxxxxxxxxxxxxxxxxxxx`

---

### 2. PASOS DE VERIFICACIÓN POST-DESPLIEGUE (SMOKE TESTS)

1. **Navegación Móvil y Desktop**: Probar el storefront en escritorio y dispositivo móvil comprobando el footer, la barra inferior táctil `MobileBottomBar` y la carga rápida de imágenes.
2. **Creación Atómica de Orden**: Realizar un pedido de prueba comprobando que la función `create_online_order_validated` responda con el número de orden y subtotal autoritativo.
3. **Checkout Wompi**: Verificar que el widget de Wompi abra correctamente en modalidad Sandbox o Producción utilizando la llave pública.
4. **Webhook en Segundo Plano**: Confirmar que Wompi envíe el POST a `https://<tu-proyecto>.supabase.co/functions/v1/wompi-webhook` y actualice el estado de `payment_pending` a `paid`.
5. **Deducción de Inventario**: Verificar en la tabla `inventories` de PostgreSQL que la cantidad de prendas disponibles disminuya en tiempo real.
