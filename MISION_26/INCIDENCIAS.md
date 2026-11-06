# M26 — Registro de incidencias abiertas

Incidencias detectadas durante M26 que quedan fuera de su alcance. No se corrigen en M26; se registran para la misión que
corresponda. Las incidencias resueltas dentro de cada tarea se documentan en el informe de esa tarea.

| ID | Detectada en | Clasificación | Estado |
|---|---|---|---|
| INC-M26-01 | T5 (prueba de humo sobre el stack local) | **Pendiente de integración entre el frontend y el esquema M24** | Abierta |

## INC-M26-01 — Frontend escrito para el esquema anterior (síntoma visible: `column products.deleted_at does not exist`)
> **Corregida en M26-R1 (MIN-5).** La descripción original subestimaba el alcance y el efecto: el error no se ve como
> un fallo, porque el catálogo cae **en silencio a datos simulados**, y el desajuste no se limita a `deleted_at`.

- **Síntoma:** al arrancar contra el stack local, la aplicación consulta productos y PostgREST responde
  `HTTP 400 · 42703 · column products.deleted_at does not exist`.
- **Causa:** la capa de datos del frontend (`apps/web/src/services/productService.js`, `apps/web/src/hooks/useProducts.js`)
  sigue escrita para el esquema ERP anterior: filtra por `products.deleted_at` (borrado lógico) y espera relaciones como
  `variants`, `sizes` y `colors` con la forma antigua. La línea base M24 no tiene `deleted_at`: modela la publicación con
  `status` y `published_at`.
- **No es un defecto del entorno:** la misma llave anon generada en T5, contra el mismo stack, responde HTTP 200 a una
  consulta válida (`select=id`).
- **Efecto real (verificado en R1):** `productService.getProducts()` captura el error de PostgREST y devuelve
  `PRODUCTS` de `apps/web/src/data/mockData`, con solo un `console.warn` que lo atribuye a una "falla de red". La tienda
  **parece funcionar** en local y en QA mostrando un catálogo simulado; el error solo se ve en la consola.
- **Alcance mayor que `deleted_at` (inventario estático en R1, no exhaustivo):** el código de `apps/web/src` consulta
  tablas que la línea base M24 no tiene (`carts`, `cart_items`) y llama a 6 RPC que no existen en ella
  (`get_order_status`, `update_order_status`, `get_commercial_dashboard_metrics`, `create_sale_atomic`,
  `create_online_order_validated_idempotent`, `adjust_inventory_stock`). Afecta a catálogo, carrito, checkout,
  seguimiento de pedidos, panel administrativo y POS.
- **Impacto:** ningún flujo de datos real de la tienda puede validarse en local ni en QA hasta la integración; las
  pruebas manuales en QA podrían dar falsos positivos por el catálogo simulado. No afecta a Production (no se ha
  desplegado este código).
- **Decisión del propietario (2026-11-06):** no modificar ahora la lógica de productos ni las migraciones. Las
  migraciones son inmutables por política; la corrección corresponde al frontend.
- **Siguiente paso propuesto:** una tarea de integración frontend ↔ esquema M24 en las misiones de aplicación (M27–M34):
  inventariar todas las consultas de `apps/web/src` contra el esquema real y adaptarlas, con pruebas contra el stack local.
- **Detección automática:** `pnpm smoke:env-local` (T5) lo informa como "AVISO: errores 4xx de esquema". No detecta el
  catálogo simulado ni las RPC ausentes. La tarea de integración debería, además, retirar el respaldo silencioso a
  datos simulados (o hacerlo visible) en los entornos local y QA.
- **Decisión del propietario (R1):** se resuelve después, como tarea funcional separada; R1 no modifica catálogo,
  checkout ni POS.
