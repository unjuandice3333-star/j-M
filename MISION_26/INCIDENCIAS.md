# M26 — Registro de incidencias abiertas

Incidencias detectadas durante M26 que quedan fuera de su alcance. No se corrigen en M26; se registran para la misión que
corresponda. Las incidencias resueltas dentro de cada tarea se documentan en el informe de esa tarea.

| ID | Detectada en | Clasificación | Estado |
|---|---|---|---|
| INC-M26-01 | T5 (prueba de humo sobre el stack local) | **Pendiente de integración entre el frontend y el esquema M24** | Abierta |

## INC-M26-01 — `column products.deleted_at does not exist`
- **Síntoma:** al arrancar contra el stack local, la aplicación consulta productos y PostgREST responde
  `HTTP 400 · 42703 · column products.deleted_at does not exist`.
- **Causa:** la capa de datos del frontend (`apps/web/src/services/productService.js`, `apps/web/src/hooks/useProducts.js`)
  sigue escrita para el esquema ERP anterior: filtra por `products.deleted_at` (borrado lógico) y espera relaciones como
  `variants`, `sizes` y `colors` con la forma antigua. La línea base M24 no tiene `deleted_at`: modela la publicación con
  `status` y `published_at`.
- **No es un defecto del entorno:** la misma llave anon generada en T5, contra el mismo stack, responde HTTP 200 a una
  consulta válida (`select=id`).
- **Impacto:** el catálogo no carga en local ni lo haría en QA hasta adaptar la capa de datos. No afecta a Production
  (no se ha desplegado este código).
- **Decisión del propietario (2026-11-06):** no modificar ahora la lógica de productos ni las migraciones. Las
  migraciones son inmutables por política; la corrección corresponde al frontend.
- **Siguiente paso propuesto:** una tarea de integración frontend ↔ esquema M24 en las misiones de aplicación (M27–M34):
  inventariar todas las consultas de `apps/web/src` contra el esquema real y adaptarlas, con pruebas contra el stack local.
- **Detección automática:** `pnpm smoke:env-local` (T5) lo informa como "AVISO: errores 4xx de esquema".
