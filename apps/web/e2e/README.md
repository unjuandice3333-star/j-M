# Recorridos E2E de navegador (M27) — ejecución manual contra el stack LOCAL

Requisitos: stack local de Supabase en marcha (`supabase start`), `apps/web/.env.local` generado (`pnpm env:local`) y
`vite` en `http://localhost:3000` con las variables de servidor locales (para `/api/wompi/*`). Playwright con Chromium.

    supabase status -o json > /tmp/jm-status.json
    export STATUS_JSON=/tmp/jm-status.json WOMPI_EVENTS_SECRET=<el mismo secreto de eventos LOCAL con el que corre vite>
    node apps/web/e2e/e2e_checkout.cjs        # recorrido de compra (cupón, pedido, intento de pago, webhook firmado)
    node apps/web/e2e/e2e_auth.cjs            # registro, compra con sesión, historial, logout, recuperación de contraseña
    node apps/web/e2e/e2e_admin.cjs           # recorrido 3: producto, imagen, precio, inventario, cupón
    ORDER=JM-00xxxx node apps/web/e2e/e2e_orders_security.cjs   # estados de pedido + recorrido 4 (seguridad)
    PROD_E2E=<slug> node apps/web/e2e/e2e_negative.cjs          # recorrido 5 (casos negativos)
    node apps/web/e2e/e2e_quality.cjs         # recorrido 2 + móvil/escritorio, consola, desbordes
    node apps/web/e2e/cleanup_e2e.cjs         # el admin archiva el producto y desactiva el cupón de prueba

Solo loopback: `lib_local.cjs` aborta si la URL no es 127.0.0.1. Las contraseñas de los usuarios seed se fijan al azar en
cada ejecución con la API admin del GoTrue LOCAL (los seeds no tienen contraseña conocida). Nunca contactan a Wompi.
