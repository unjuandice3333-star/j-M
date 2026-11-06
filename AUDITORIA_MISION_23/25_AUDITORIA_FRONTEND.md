# 25 — AUDITORÍA FRONTEND · J&M FASHION STORE

**Repositorio:** `unjuandice3333-star/j-m` · `main` · `2661f2a`
**Alcance:** `apps/web` (React 18 + Vite 5 + Zustand 4 + React Router 6 + TanStack Query 5), `packages/ui`.

> **Evidencia de ejecución.** Build de producción ejecutado en una copia temporal del repo. La app compilada se abrió en Chromium headless (Playwright) en dos variantes: (a) sin variables de entorno, (b) con `VITE_SUPABASE_URL` apuntando a un puerto local cerrado (Supabase inalcanzable, sin tocar servicios reales). Resultados: `evidencias/e2e_probe_output.json` y `evidencias/capturas/`. **No se probó contra Supabase QA/Production ni Wompi.**

---

## 1. Arquitectura

- Entrada: `src/main.jsx` → `App.jsx` (`ErrorBoundary` + `BrowserRouter`) → `routes/AppRoutes.jsx`.
- 3 layouts: `PublicLayout`, `AdminLayout`, `DashboardLayout` (**importado pero no usado**, legado POS).
- Páginas con `React.lazy` + `Suspense`.
- Estado global: `store/eCommerceStore.js` (590 líneas, persistido en `localStorage` con clave `jm-fashion-store-cart-v13`), `store/authStore.js`, `store/uiStore.js` (toasts). `store/cartStore.js` y `store/syncStore.js` son **legado POS sin uso funcional**.
- Estilos: casi todo **inline** (`style={{…}}`) con colores literales; CSS Modules solo en piezas legado; variables en `packages/ui/src/styles/variables.css`.
- TanStack Query está instalado y configurado, pero solo lo usa `hooks/useProducts.js`, **que nadie importa**. Los datos se cargan con `useEffect` + Zustand.
- Sin TypeScript en la app (JS/JSX). `packages/types` no se usa.

## 2. Clasificación por módulo

| # | Módulo | Estado | Prioridad |
|---|---|---|---|
| F1 | Arquitectura, rutas y navegación | IMPLEMENTADO Y VERIFICADO (renderizado de rutas) | P2 |
| F2 | Estado global (Zustand) | PARCIALMENTE IMPLEMENTADO | P1 |
| F3 | Catálogo | PARCIALMENTE IMPLEMENTADO | P0 |
| F4 | Filtros y búsqueda | PARCIALMENTE IMPLEMENTADO | P1 |
| F5 | Ficha de producto | PARCIALMENTE IMPLEMENTADO | P0 |
| F6 | Galería de imágenes por color | NO IMPLEMENTADO | P1 |
| F7 | Variantes talla/color | PARCIALMENTE IMPLEMENTADO | P0 |
| F8 | Carrito | IMPLEMENTADO, PERO NO VERIFICADO | P1 |
| F9 | Checkout | PRESENTA ERRORES | P0 |
| F10 | Experiencia de pago y confirmación | PRESENTA ERRORES | P0 |
| F11 | Cuenta del cliente | PARCIALMENTE IMPLEMENTADO | P1 |
| F12 | Favoritos (wishlist) | PARCIALMENTE IMPLEMENTADO (solo local) | P3 |
| F13 | Admin — login y guardas | IMPLEMENTADO, PERO NO VERIFICADO | P1 |
| F14 | Admin — dashboard | PRESENTA ERRORES | P1 |
| F15 | Admin — productos | PRESENTA ERRORES | P0 |
| F16 | Admin — inventario | REQUIERE REVISIÓN | P1 |
| F17 | Admin — pedidos | PRESENTA ERRORES | P0 |
| F18 | Admin — clientes | IMPLEMENTADO, PERO NO VERIFICADO | P2 |
| F19 | Admin — descuentos | SIMULADO O MOCK | P1 |
| F20 | Admin — reseñas | SIMULADO O MOCK | P2 |
| F21 | Admin — analítica | SIMULADO O MOCK | P2 |
| F22 | Admin — colecciones | SIMULADO O MOCK | P2 |
| F23 | Admin — imágenes editoriales | SIMULADO O MOCK (solo `localStorage`) | P1 |
| F24 | Diseño responsive / móvil | PARCIALMENTE IMPLEMENTADO | P1 |
| F25 | Estados de carga y error | PARCIALMENTE IMPLEMENTADO | P1 |
| F26 | Accesibilidad | REQUIERE REVISIÓN | P2 |
| F27 | Rendimiento | PARCIALMENTE IMPLEMENTADO | P2 |
| F28 | SEO técnico | IMPLEMENTADO, PERO NO VERIFICADO | P3 |

---

## 3. Hallazgos detallados

### F1 — Rutas · VERIFICADO (renderizado)
Rutas públicas: `/`, `/ropa`, `/ropa/:category`, `/linea/:styleLine`, `/producto/:slug`, `/carrito`, `/checkout`, `/checkout/confirmacion`, `/cuenta/*`, páginas informativas. Admin bajo `/admin/*` con `AuthGuard`.
- Verificado en navegador: todas las rutas probadas renderizan; `/admin` redirige a `/admin/login` sin sesión.
- Problemas: no hay ruta de edición `/admin/productos/:id` (se usa `?editId=`); `AdminPasswordSetup.jsx` sin ruta; `/admin/configuracion` muestra el dashboard; catch-all redirige a `/` (no hay página 404). `postbuild.js` copia `index.html` a 12 carpetas para "triple-dist" y hay **dos** `vercel.json` (raíz y `apps/web`) con reglas diferentes.
- La guarda de admin es **solo de cliente**; la seguridad real depende de RLS (ver doc 26, D4).

### F2 — Estado global · PARCIAL
- `eCommerceStore` mezcla catálogo, carrito, wishlist, cupones, perfil, direcciones, pedidos, imágenes editoriales y modales.
- **Persiste el catálogo completo en `localStorage`** (`partialize` incluye `products`). Arranca con `PRODUCTS` (mock) como estado inicial ⇒ un visitante nuevo ve primero productos ficticios hasta que llega la respuesta de Supabase.
- `wishlist` inicial `['prod-1','prod-3']` (ids mock): el contador del header muestra **2 favoritos a todo visitante nuevo** (visible en `capturas/mobile_home.png`).
- `userProfile` y `savedAddresses` son solo locales; la tabla `customer_addresses` no se usa.
- `orders` locales con `date: 'Hoy'`.

### F3 — Catálogo · PARCIAL
- Lee `products` con joins (`categories`, `brands`, `variants(sizes, colors)`).
- **Fallback silencioso a mock** ante cualquier error (verificado: Supabase inalcanzable ⇒ 18 productos ficticios visibles, sin aviso).
- Datos inventados en la normalización: `rating 4.9`, `reviewCount 12`, `isNew true`, `fit 'REGULAR'`, `occasion 'casual'`, `details`, tallas por defecto `S–XL`, color por defecto `Negro Premium`, línea de estilo por defecto `urbana`, imagen por defecto de Unsplash.
- Sin paginación (descarga todo el catálogo).
- **Terminado cuando:** catálogo 100 % desde BD, sin valores inventados, con estado vacío/error explícito, paginado o con carga incremental.

### F4 — Filtros y búsqueda · PARCIAL
Filtrado y orden en cliente (`CatalogPage.jsx:113-163`) por línea, categoría, fit, talla, ocasión, nuevo, más vendido, oferta, precio. Varios atributos no existen en BD (ver F3), por lo que con datos reales los filtros de fit/ocasión/oferta/nuevo **no discriminan**. La búsqueda es por texto en cliente; no hay búsqueda en servidor ni tolerancia a tildes verificada.

### F5 — Ficha de producto · PARCIAL
- Slug inexistente ⇒ muestra el primer producto en vez de 404 (verificado: `/producto/x-no-existe` → "Camiseta Heavyweight Oversize Essential").
- Reseñas de `mockData.REVIEWS`.
- No muestra stock por talla/color ni deshabilita tallas agotadas (no se consulta `inventories` ni `get_available_stock`).
- JSON-LD `Product` inyectado (correcto), pero con datos inventados (rating).

### F6 — Galería por color · NO IMPLEMENTADO
`selectedColor` no cambia las imágenes (`ProductDetailPage.jsx:152` usa solo el índice `selectedImage`). Las imágenes se toman de `variants.image_url` de todas las variantes mezcladas. No hay modelo de datos para galería por color (doc 26, D1).

### F7 — Variantes talla/color · PARCIAL
`addItem()` (`eCommerceStore.js:203-276`) resuelve la variante por coincidencia aproximada de nombre de color, luego por código SKU (`BEI/BLA/GRI/NEG`) y **finalmente solo por talla** ⇒ puede agregar al carrito un **color distinto del elegido**. Productos sin variantes reales quedan con `variantId = null` y el checkout los rechaza al final del proceso, no al agregar.

### F8 — Carrito · NO VERIFICADO
Funcional en local (agregar, cambiar cantidad, eliminar, guardar para después). La sincronización con servidor es parcial (doc 24, B4). El cálculo de totales en cliente **difiere del servidor** cuando hay cupón (ver F9).

### F9 — Checkout · PRESENTA ERRORES
- `idempotencyKey` se crea una vez por montaje de la página: reintentar tras un rechazo reutiliza el mismo pedido (y la misma `reference` de Wompi). *Requiere revisión* con las reglas de unicidad de referencia de Wompi.
- Cupones: `applyCoupon` valida contra una lista fija en el código; el total mostrado puede no coincidir con el que cobra el servidor.
- "Envío Expreso 24h" se muestra como opción, pero el total no cambia ni en cliente ni en servidor.
- "Pago Contraentrega" crea el pedido y navega a confirmación, pero el pedido queda en `payment_pending` sin flujo posterior.
- Layout de 2 columnas fijas `1fr 420px` (inline); depende de una clase CSS para móvil.
- Validación de formulario solo con `required` HTML; sin validación de teléfono/email colombianos.

### F10 — Pago y confirmación · PRESENTA ERRORES
- `OrderConfirmationPage.jsx` intenta leer `online_orders` (los invitados no tienen permiso RLS) y luego llama `rpc('get_order_status')`, **función inexistente** (doc 26, T7). Un comprador invitado **no ve el estado real** de su pedido; el *polling* cada pocos segundos falla repetidamente.
- La línea de tiempo usa el estado `preparing` (no existe en BD).
- El vaciado del carrito depende de detectar `paid`; si la lectura falla, el carrito no se limpia.
- Analítica `purchase` deduplicada con `localStorage` (correcto en intención).

### F11 — Cuenta · PARCIAL
Login/registro reales (Supabase). La lista de pedidos consulta `online_orders` **sin filtrar por usuario**: con la RLS actual un cliente vería **todos los pedidos de la tienda** (doc 26, D4); los ítems salen vacíos (sin política SELECT). Direcciones y datos personales no se guardan en BD.

### F13 — Admin login · NO VERIFICADO
`AdminLogin.jsx`: email/contraseña y Google OAuth vía Supabase; redirige si el perfil no es admin. Verificado solo el redireccionamiento sin sesión.

### F14 — Admin dashboard · PRESENTA ERRORES
Llama `get_commercial_dashboard_metrics` (falla siempre por `'packed'`) y además usa `PRODUCTS` de mock para "top productos".

### F15 — Admin productos · PRESENTA ERRORES
Ver doc 24, B2: no crea variantes/inventario/imágenes; `style_line_id` inexistente; `addProduct` sin `await` ⇒ navega a `/producto/undefined`. Las imágenes se ingresan como URL de texto (no hay subida a Supabase Storage).

### F16 — Admin inventario · REQUIERE REVISIÓN
Lee `inventories` con joins y ajusta con `adjust_inventory_stock`. Funcionaría con permisos correctos; *inferencia*: en remoto `EXECUTE` revocado y política que excluye `super_admin`. Columnas "reservado" siempre 0. Usa `alert()`.

### F17 — Admin pedidos · PRESENTA ERRORES
Estado `preparing` inválido; faltan `processing` y `refunded`; guía no persistida; sin detalle de ítems (sin política SELECT en `online_order_items` para admin).

### F18 — Admin clientes · NO VERIFICADO
Lee `profiles` (admin puede por RLS). No muestra compradores invitados (no están en `profiles`); filtro de "tier" sin datos de respaldo.

### F19–F23 — Admin simulados
| Página | Evidencia |
|---|---|
| `AdminDiscountsPage.jsx` | `useState` con 3 cupones inventados; crear cupón solo modifica estado local |
| `AdminReviewsPage.jsx` | `REVIEWS` de mock; aprobar/ocultar solo local |
| `AdminAnalyticsPage.jsx` | cifras fijas en el código (12.450 visitas, $33.400.000, "CONECTADO") |
| `AdminCollectionsPage.jsx` | `OCCASIONS` de mock; botones sin acción |
| `AdminEditorialImagesPage.jsx` | guarda URLs/Base64 (FileReader) en `localStorage`: **los cambios solo los ve el navegador del admin**, nunca los clientes |

### F24 — Responsive / móvil · PARCIAL
Verificado en iPhone 13 emulado (`capturas/mobile_home.png`): sin desbordamiento horizontal; existe `MobileBottomBar`. Problemas visibles: el logotipo "J&M FASHION STORE" se recorta/superpone en la cabecera; el botón flotante de WhatsApp y su globo "¿Necesitas ayuda?" **tapan** los ítems "Buscar"/"Carrito" de la barra inferior.

### F25 — Carga y errores · PARCIAL
- Build sin variables de entorno ⇒ **pantalla en blanco** (`#root` vacío; el `throw` de `config/supabase.js` ocurre al importar el módulo, antes de que el `ErrorBoundary` pueda actuar) — verificado (`capturas/00_build_sin_env.png`).
- Spinners en `Suspense` y `AuthGuard`. Errores de servicio se tragan con `console.warn` y fallback a mock.

### F26 — Accesibilidad · REQUIERE REVISIÓN
No se ejecutó un auditor automático (axe/Lighthouse). Observaciones en código: 129 `<button>` y solo 18 `aria-label` en todo `src/` (muchos botones-ícono sin nombre accesible), color como único indicador en selección de color, `outline` personalizado; requiere auditoría formal.

### F27 — Rendimiento · PARCIAL
Bundle principal `index-*.js` **511,52 kB** (145 kB gzip), por encima del umbral de advertencia de Vite. Imágenes externas de Unsplash sin `srcset` ni formato moderno; fuentes de Google cargadas en bloque; catálogo completo en memoria y en `localStorage`.

### F28 — SEO · NO VERIFICADO
Meta OG/Twitter, `robots.txt`, `sitemap.xml` **estático** (no incluye productos reales), JSON-LD de producto. SPA sin SSR: los buscadores dependen de ejecutar JS.

---

## 4. Código muerto / duplicado (para limpieza)
`store/cartStore.js`, `store/syncStore.js`, `layouts/DashboardLayout.jsx` (+ `.module.css`), `pages/Dashboard.jsx`, `pages/Inventory.jsx`, `pages/Customers.jsx`, `pages/Login.jsx` (sí enrutado, pero usa `@jm/ui` POS), `hooks/useProducts.js`, `hooks/useBarcodeScanner.js`, `scripts/build.js` (duplicado en raíz), `data/mockData.js` (497 líneas, aún importado por 25 archivos — `formatCOP` vive allí).

## 5. Dependencias
F3/F5/F6/F7 dependen del modelo de catálogo (doc 26). F9/F10 dependen de las RPCs corregidas (doc 24). F15–F23 dependen de RPCs admin y Storage.

## 6. Criterios de terminado (frontend)
1. Ningún dato mock en el bundle de producción (verificable con grep en `dist/`).
2. Flujos E2E automatizados verdes en QA: navegar → elegir talla/color → carrito → checkout → Wompi Sandbox aprobado/rechazado → confirmación → cuenta.
3. Admin: crear producto con variantes e imágenes por color, ajustar stock, cambiar estado de pedido con guía; cada acción persistida y verificada recargando.
4. Lighthouse móvil ≥ 85 rendimiento, ≥ 90 accesibilidad; sin solapamientos en 360–430 px.
5. Página 404 real; manejo de error de configuración visible (no pantalla en blanco).
