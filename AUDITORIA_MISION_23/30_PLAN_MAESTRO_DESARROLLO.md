# 30 — PLAN MAESTRO DE DESARROLLO · J&M FASHION STORE

**Base:** hallazgos de los documentos 23–29. **No incluye implementación.** Las misiones se numeran a partir de 24 para continuar la secuencia; cada una tiene objetivo, entregables, dependencias y criterio de terminado verificable.

---

## 1. Visión de las fases

| Fase | Objetivo | Misiones |
|---|---|---|
| **0. Cimientos** | Que todo sea reproducible, verificable y seguro de operar por agentes | 24, 25, 26 |
| **1. Núcleo transaccional** | Que una compra real funcione de punta a punta en QA | 27, 28, 29 |
| **2. Catálogo y operación** | Que el negocio pueda cargar productos y operar pedidos | 30, 31, 32 |
| **3. Experiencia y calidad** | Que la tienda sea profesional en móvil, rápida y accesible | 33, 34 |
| **4. Fábrica en régimen** | Que la fábrica trabaje autónoma y entregue releases | 35, 36 |

## 2. Misiones

### Misión 24 — Línea base de esquema y entorno local (P0)
- **Objetivo:** BD reconstruible desde cero; repo = fuente de verdad del esquema.
- **Tareas:** (humano autorizado) volcado *solo esquema* de Production para medir *drift*; definir esquema objetivo e-commerce; crear migración base consolidada (squash) sin legado POS; `supabase/config.toml`, `seed.sql` determinista (catálogo mínimo con variantes, stock, cupones, usuarios QA); script `pnpm db:reset`.
- **Dependencias:** ninguna.
- **Terminado cuando:** `supabase db reset` sin errores en local y en CI; diff de esquema documentado; ninguna función referencia columnas inexistentes (verificado con prueba que ejecuta cada función).

### Misión 25 — CI, ramas y gobierno (P0)
- **Objetivo:** ningún cambio sin pruebas.
- **Tareas:** GitHub Actions (install, lint con `eslint.config.js`, typecheck, unit, db reset + pgTAP, build); protección de `main`; plantilla de issue/PR; arreglar runners de pruebas existentes (vitest, Node 22 mocks, Deno); archivar ramas `Principal`/`Director`; marcar como históricos los informes "GO-LIVE".
- **Dependencias:** 24 (para el paso de BD).
- **Terminado cuando:** un PR de prueba muestra todos los checks; push directo a `main` bloqueado.

### Misión 26 — Entornos QA y política de secretos (P0)
- **Objetivo:** entorno donde los agentes trabajan sin riesgo para Production.
- **Tareas (humano + agente):** proyecto Supabase QA; Vercel Preview ligado a QA; Wompi Sandbox; variables por entorno (tabla del doc 27); webhook único registrado en Sandbox; verificación de que los agentes no poseen credenciales de Production.
- **Dependencias:** 24.
- **Terminado cuando:** despliegue de `main` a QA automático; prueba documentada de que una credencial de Production no está disponible en sandboxes.

### Misión 27 — Checkout y pedidos correctos (P0)
- **Tareas:** RPC de pedido con líneas desde BD (precio, nombre, talla, color); `user_id = auth.uid()`; cupón inválido ⇒ error; `min_purchase` y `free_shipping`; costos por método de envío; contraentrega con estado propio o retirarla; número de pedido por secuencia; prohibir INSERT directo; RPC `get_order_status` segura para invitados (token de pedido); RLS de pedidos/ítems/pagos por propietario.
- **Dependencias:** 24, 25.
- **Terminado cuando:** pgTAP cubre T1–T3, T9–T14, T16 con resultados correctos; E2E checkout en QA verde.

### Misión 28 — Pago Wompi e inventario (P0)
- **Tareas:** webhook único; deducción de inventario al pagar funcionando; estrategia de sobreventa (reserva con expiración o validación + reembolso/alerta); restauración en cancelación/reembolso; protección de estados avanzados frente a eventos tardíos; firma rechaza pedidos no pagables; reintento tras rechazo con nueva referencia.
- **Dependencias:** 27, 26.
- **Terminado cuando:** pruebas Sandbox: aprobado, rechazado, reintento aprobado, webhook duplicado, concurrencia de última unidad — con IDs de transacción y estados en BD como evidencia.

### Misión 29 — Confirmación, cuenta y notificaciones (P1)
- **Tareas:** página de confirmación con estado real (invitado y registrado); cuenta: pedidos propios con ítems, direcciones en `customer_addresses`, perfil persistido; correo de confirmación de pedido (proveedor a elegir).
- **Dependencias:** 27, 28.
- **Terminado cuando:** E2E invitado y registrado; correo recibido en buzón de prueba.

### Misión 30 — Catálogo real: variantes, stock e imágenes por color (P0/P1)
- **Tareas:** modelo `product_images` (color, orden) + Supabase Storage; atributos de catálogo usados por la UI (slug, línea de estilo, fit, ocasión, precio anterior, flags) en BD; eliminar valores inventados y fallback a mock; 404 real; stock por talla/color en la ficha; selección de variante exacta; galería que cambia por color.
- **Dependencias:** 24.
- **Terminado cuando:** grep de `mockData` en `dist/` = 0; E2E de selección color→imágenes→talla agotada deshabilitada.

### Misión 31 — Panel administrativo operativo (P0/P1)
- **Tareas:** CRUD producto→variantes→inventario→imágenes en RPC transaccional; inventario con permisos correctos (incl. super_admin) y movimientos; OMS con estados del enum, guía persistida, detalle de ítems, cancelación con restauración; dashboard con métricas reales; cupones reales; reseñas reales (moderación); imágenes editoriales en BD/Storage; eliminar páginas simuladas o conectarlas.
- **Dependencias:** 27, 28, 30.
- **Terminado cuando:** E2E admin verde; cada acción persiste tras recargar; 0 páginas admin con datos fijos.

### Misión 32 — Reseñas, analítica y marketing (P2)
- **Tareas:** reseñas de compradores verificados con moderación; GA4/Meta con carga real de scripts y consentimiento; sitemap dinámico.
- **Dependencias:** 29, 31.
- **Terminado cuando:** eventos visibles en GA4 DebugView (QA); reseña creada→aprobada→visible.

### Misión 33 — UX móvil, accesibilidad y rendimiento (P1/P2)
- **Tareas:** corregir header y botón de WhatsApp en móvil; sistema de estilos (sustituir estilos inline por tokens/CSS); 404; error de configuración visible; división de bundle (<250 kB inicial); imágenes optimizadas; auditoría axe/Lighthouse.
- **Dependencias:** 30.
- **Terminado cuando:** Lighthouse móvil ≥ 85/90; 0 violaciones axe críticas; capturas por breakpoint sin solapamientos.

### Misión 34 — Limpieza de deuda técnica (P1)
- **Tareas:** eliminar legado POS (stores, layouts, páginas, packages `shared`/`types` obsoletos), un solo `vercel.json`, quitar `postbuild` "triple-dist" si Vercel rewrites funciona, migración gradual a TypeScript en servicios/stores, TanStack Query o Zustand (uno) para datos remotos.
- **Dependencias:** 25; puede ir en paralelo a 30–33.
- **Terminado cuando:** código muerto 0 (herramienta `knip` o similar en CI); typecheck de la app.

### Misión 35 — Implementación de la fábrica (P0 para autonomía)
- **Tareas:** imagen de contenedor, orquestador, plantillas de tareas, agentes y prompts de rol, revisor cruzado, reporte de evidencias, presupuestos, tablero (doc 29).
- **Dependencias:** 24, 25, 26 (puede arrancar en piloto tras 26).
- **Terminado cuando:** la fábrica completa 3 tareas reales de punta a punta (issue→PR→CI→revisión→merge→QA) sin intervención, con informe de evidencias.

### Misión 36 — Primer release candidato y salida a Production (P0)
- **Tareas:** congelar alcance, regresión completa en QA, informe de evidencias, aprobación humana, release por pipeline sin agentes, smoke tests no transaccionales, plan de *rollback*.
- **Dependencias:** 27–31, 33.
- **Terminado cuando:** aprobación humana registrada y release desplegado con smoke tests verdes.

## 3. Orden de ejecución y paralelismo

```
24 ──► 25 ──► 26 ──► 35 (piloto de fábrica)
 │      │      │
 │      └──────┴──► 27 ──► 28 ──► 29
 │                  │       │
 └──► 30 ───────────┴───────┴──► 31 ──► 32
         └──► 33                 │
 25 ──► 34 (paralelo)            └──► 36 (release)
```

Recomendación: ejecutar **24, 25 y 26 de forma asistida (humano + agente)**, porque establecen las barreras de seguridad. A partir de 27, la fábrica puede operar de forma autónoma dentro de QA.

## 4. Riesgos principales

| Riesgo | Impacto | Mitigación |
|---|---|---|
| *Drift* desconocido en Production | Migraciones nuevas rompen Production | Volcado de esquema y diff antes de cualquier release; migración de transición revisada por humano |
| Datos reales con defectos (líneas de pedido con precio del cliente, pedidos insertados por anon) | Contabilidad e inventario incorrectos | Script de diagnóstico **de solo lectura** en Production ejecutado por humano |
| Pedidos pagados no marcados (webhook 500) | Clientes cobrados sin pedido | Revisar en panel Wompi transacciones aprobadas vs pedidos (humano), antes de Misión 28 |
| PII expuesta a clientes autenticados (RLS) | Legal/Habeas Data | Priorizar corrección de RLS de pedidos/pagos en Misión 27 (o antes, por decisión del propietario) |
| Agentes con credenciales de Production | Daño irreversible | Política de secretos de Misión 26 verificada |

## 5. Estimación de esfuerzo (orientativa)

| Misión | Tamaño |
|---|---|
| 24 | L |
| 25 | M |
| 26 | M (requiere acciones humanas) |
| 27 | L |
| 28 | L |
| 29 | M |
| 30 | L |
| 31 | XL |
| 32 | M |
| 33 | M |
| 34 | M |
| 35 | L |
| 36 | M |

(S < 1 día de fábrica, M 1–3, L 3–7, XL > 7; sujeto a calibración con el piloto de la fábrica.)
