# Informe de aceptación — J&M FASHION STORE

Preparado en la ejecución 159 (2026-11-15). Rama: `mission/m26-dev-qa-environments`. Nada se desplegó a Production.
Este informe distingue lo **ejecutado y verificado** de lo **pendiente del propietario**. No contiene secretos.

## 1. Estado en una línea
La tienda está completa en código y probada contra PostgreSQL/Supabase **local** y un backend sintético en navegador real.
Falta validarla contra **servicios reales**: Supabase QA (sin el baseline M24), Wompi Sandbox (sin credenciales) y
Vercel Preview (sin acceso del agente). Esos tres pasos son del propietario (ver §4).

## 2. Funcionalidad entregada (verificada con pruebas)
| Área | Qué hay | Cómo se verificó |
|---|---|---|
| Catálogo | Portada, colecciones, filtros, búsqueda, ficha con galería, reseñas paginadas, favoritos | vitest + E2E sintético (Chromium) |
| Variantes y stock | Color/talla, combinaciones agotadas no comprables, tope de cantidad por stock, aviso si se agota en el carrito | vitest, E2E, pgTAP (reservas y concurrencia) |
| Carrito | Persistente (local + cuenta), fusión invitado→cliente, dos navegadores, cupones, envío gratis por umbral configurable | vitest, E2E |
| Cuenta | Registro, inicio/cierre de sesión, recuperar contraseña, datos, libreta de direcciones, «Mis pedidos» paginado con guía y solicitud de cambio | vitest, E2E, comprobaciones HTTP en Supabase local |
| Checkout y pedidos | Invitado y registrado, métodos de envío, reserva de stock, pedido pendiente reintentable, pago rechazado conserva el carrito | vitest, E2E, pgTAP |
| Wompi | Firma de integridad en servidor, webhook con firma/timestamp/idempotencia, reconciliación de estados, límite de tasa | 16 pruebas del handler + flujo real con Supabase local en CI (`db-supabase`) — **sin Sandbox real** |
| Admin | Panel, productos (borrador/publicado, imágenes), inventario con motivo, pedidos (estados, guía, revisión, reembolso/devolución), clientes, cupones, colecciones, reseñas, boletín, envíos, configuración | vitest, E2E, pgTAP |
| Seguridad | RLS por tabla, RPC con comprobación de rol, cliente no entra al admin, guardas de entorno (Production imposible desde QA), sin secretos en el bundle | pgTAP, 39 comprobaciones HTTP, pruebas de entorno, `build.sh` |
| Accesibilidad / móvil | Teclado y foco en todos los botones que cambian de estado, 320/375 px sin desbordamiento | 87 recorridos E2E |

## 3. Pruebas (última ejecución real)
| Suite | Resultado | Dónde |
|---|---|---|
| `pnpm test:unit` | 766/766 (87 archivos) | este contenedor, ejecución 159 |
| `pnpm test:e2e-synthetic` | 87/87 recorridos | este contenedor + job `e2e-synthetic` del CI |
| pgTAP + concurrencia | 435/435, 12/12 | ejecución 126 + job `db-local` del CI (verde en cada push) |
| Supabase local (`db-supabase`, `e2e-supabase`) | verde | GitHub Actions en cada push (run `ci` nº 203, `e2e-supabase` nº 181) |
| ESLint / build | 0 problemas / OK | este contenedor |
| `security` (gitleaks del historial) | ✘ por dos cadenas de prueba con forma de JWT en `e142ab2` | decisión del propietario (`gitleaks-allowlist-e142ab2.patch`) |

## 4. Bloqueos del propietario (en orden)
1. **Supabase QA**: aplicar el baseline M24 y las migraciones (`supabase/migrations/`) al proyecto de QA. El agente
   no ejecuta `db push`/`link` sobre remotos. Comprobación: `pnpm qa:diagnose` (solo lectura, llave anon).
2. **Wompi Sandbox**: cargar en Vercel (entorno Preview) las variables de `OWNER_STEPS.md` §B y la URL de eventos.
3. **Vercel Preview**: confirmar que el push de la rama genera el Preview y que Production no cambia.
4. **WhatsApp real**: definir `VITE_STORE_WHATSAPP` (p. ej. `+57 3xx xxx xxxx`) en Vercel Preview. Sin ella la
   tienda usa el marcador `573000000000` en el pie, el botón flotante, `/contacto`, la política y «Mis pedidos».
5. **CI**: decidir el allowlist de gitleaks y si `e2e-supabase` entra en `ci-gate`.

## 5. Pasos de aceptación
Con 1–4 hechos: `pnpm test:pw:selftest` → `pnpm test:pw:preview` (ver `PLAYWRIGHT_GUIDE.md`), después los 12 flujos
manuales de `OWNER_CHECKLIST.md` (incluye pago aprobado y rechazado con tarjetas de prueba de Wompi Sandbox y la
verificación del webhook en Supabase QA). URL del Preview: la asigna Vercel al push (el agente no la conoce).

## 6. Limitaciones conocidas
- Los E2E de navegador usan un backend sintético en memoria; RLS y BD real se prueban aparte (pgTAP y Supabase local).
- Ningún pago se ha procesado en Wompi Sandbox real; el estado «pagado» en E2E viene de un webhook sintético etiquetado.
- Las solicitudes de cambio/devolución son manuales por WhatsApp (sin tabla de solicitudes, D136).
