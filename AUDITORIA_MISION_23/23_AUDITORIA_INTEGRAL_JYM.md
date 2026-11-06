# 23 — AUDITORÍA INTEGRAL · J&M FASHION STORE

**Misión 23 — Diagnóstico para la transformación en AI Software Factory**
**Repositorio:** `unjuandice3333-star/j-m` · rama auditada `main` · commit `2661f2a` (2026-10-13) · 88 commits · 142 archivos · ~23.800 líneas
**Fecha:** 2026-11-06
**Tipo:** solo diagnóstico. No se modificó código, no se ejecutaron migraciones remotas, no se accedió a QA/Production, no se desplegó ni se realizaron transacciones.

| Documento | Contenido |
|---|---|
| `24_AUDITORIA_BACKEND.md` | RPCs, Vercel/Edge Functions, Wompi, cupones, OMS |
| `25_AUDITORIA_FRONTEND.md` | React, estado, catálogo, checkout, admin, móvil |
| `26_AUDITORIA_BASES_DATOS.md` | Reconstrucción desde cero, esquema, funciones, RLS |
| `27_AUDITORIA_INTEGRACIONES.md` | Supabase, Vercel, GitHub, Wompi, variables |
| `28_AUDITORIA_PRUEBAS_QA.md` | Pruebas existentes, ejecuciones, brechas |
| `29_ARQUITECTURA_AI_SOFTWARE_FACTORY.md` | Diseño de la fábrica de agentes |
| `30_PLAN_MAESTRO_DESARROLLO.md` | Misiones 24–36, orden y criterios |
| `evidencias/` | Scripts SQL, salidas, sondeo de navegador, capturas |

---

## 1. Cómo se auditó (evidencia)

1. **Lectura completa** de las 16 migraciones, backend (`api/`, Edge Function), stores, servicios y páginas clave.
2. **Reconstrucción de la BD desde cero** en PostgreSQL 16 **local y efímero** con un *shim* mínimo de Supabase → `evidencias/rebuild_run1.txt`.
3. **Pruebas funcionales SQL** (T1–T16) sobre esa BD local → `evidencias/runtime_tests_output.txt`.
4. **Build de producción** y **ejecución de las pruebas existentes** en una copia temporal del repo (Node 22, Deno 2.9 instalado temporalmente).
5. **Sondeo de navegador** (Playwright/Chromium headless) sobre el build, con Supabase **inalcanzable a propósito** → `evidencias/e2e_probe_output.json`, `evidencias/capturas/`.
6. **Contraste** con los informes existentes del repo (`GO_LIVE_REPORT.md`, `FINAL_PRODUCTION_AUDIT.md`, etc.).

Limitaciones: sin acceso a Supabase/Vercel/Wompi remotos (por restricción); no se puede afirmar el estado real de Production. Donde se infiere, se indica.

---

## 2. Estado real del proyecto (resumen)

J&M tiene una **interfaz de tienda visualmente avanzada** y un **diseño de backend correcto en intención** (precios calculados en servidor, idempotencia, firma Wompi en servidor, webhook con verificación criptográfica). Pero el sistema **no está listo para operar** y los informes internos que dicen "GO-LIVE APPROVED / PRODUCTION VERIFIED" **no se sostienen con evidencia**:

- **La base de datos no se puede reconstruir desde el repositorio** (2 de 16 migraciones fallan) y el código depende de columnas que ninguna migración crea ⇒ el esquema remoto se modificó fuera de control de versiones (*drift*).
- **El paso "pago aprobado → descuento de inventario" falla** en la BD reconstruida: el webhook no podría marcar pedidos como pagados.
- **Las funciones de OMS y del dashboard fallan siempre** (estado `packed` inexistente).
- **Problemas de acceso a datos**: cualquier cliente autenticado puede leer todos los pedidos y modificar transacciones de pago; anon puede insertar pedidos "pagados" directamente.
- **5 de las 11 pantallas del panel admin son simuladas** (descuentos, reseñas, analítica, colecciones, imágenes editoriales) y el alta de productos **no crea variantes, stock ni imágenes**.
- **Pruebas**: solo existen pruebas con mocks; ninguna de integración, E2E ni CI.

---

## 3. Porcentaje estimado de implementación por área

### Método
1. Cada área se dividió en módulos funcionales (listados en los docs 24–28).
2. Cada módulo recibió la clasificación obligatoria y un **puntaje de funcionalidad operativa**:

| Clasificación | Puntaje |
|---|---|
| IMPLEMENTADO Y VERIFICADO | 100 |
| IMPLEMENTADO, PERO NO VERIFICADO | 80 |
| REQUIERE REVISIÓN | 60 |
| PARCIALMENTE IMPLEMENTADO | 50 |
| PRESENTA ERRORES | 40 (existe código, no funciona correctamente) |
| SIMULADO O MOCK | 15 (existe UI, no hay funcionalidad real) |
| NO IMPLEMENTADO | 0 |

3. Porcentaje del área = promedio simple de sus módulos. Porcentaje global = promedio ponderado (Backend 25 %, Frontend 25 %, BD 20 %, Integraciones 15 %, QA 15 %).
4. Mide **funcionalidad operativa verificable**, no cantidad de código. Un módulo con mucho código que falla puntúa 40.

### Resultado

| Área | Módulos | % estimado | Lectura |
|---|---|---|---|
| Backend | 16 | **43 %** | Intención correcta; errores en inventario, OMS, métricas, productos |
| Frontend | 28 | **47 %** | Storefront completo en UI; admin con 5 páginas simuladas; galería por color inexistente |
| Bases de datos | 10 | **53 %** | Tablas existen; reconstrucción, funciones y RLS con errores |
| Integraciones e infraestructura | 12 | **45 %** | Sin entorno local, sin CI, webhook duplicado, analítica simulada |
| Pruebas y QA | 11 | **25 %** | Solo build verificado y pruebas con mocks |
| **Global ponderado** | 77 | **≈ 44 %** | |

---

## 4. Funcionalidades operativas (con evidencia)

| Funcionalidad | Evidencia |
|---|---|
| Build de producción compila (exit 0) | Q2, doc 28 |
| Navegación pública y rutas renderizan; guardia admin redirige a login | Sondeo navegador |
| Creación de pedido con **total** calculado en servidor e idempotencia | T1 |
| Bloqueo de escalada de rol de cliente a admin | T15 |
| Lógica del webhook Wompi (firma, monto, idempotencia, conflictos) | 12/12 Vercel (adaptado) + 12/12 Edge — **solo con mocks** |
| Firma de integridad Wompi calculada en servidor con monto de BD | Lectura de código (no probado en Sandbox) |
| Carrito local (agregar/cambiar/eliminar) | Lectura de código + navegador |
| Sin desbordamiento horizontal en móvil | Sondeo iPhone 13 |

## 5. Funcionalidades pendientes

- Reconstrucción de BD, seeds y entorno local (`supabase/config.toml` inexistente).
- Deducción/restauración de inventario operativa; estrategia anti-sobreventa.
- Líneas de pedido con datos de BD; cupones reales (cliente + admin); envío expreso; contraentrega.
- Página de confirmación con estado real (RPC `get_order_status` inexistente).
- Alta de productos con variantes, inventario e **imágenes por color** (sin modelo de datos).
- OMS: estados válidos, guía persistida, cancelación con restauración.
- Dashboard con métricas reales; reseñas; analítica GA4/Meta; imágenes editoriales persistidas.
- Cuenta: pedidos propios con ítems, direcciones y perfil persistidos.
- Notificaciones por correo; reembolsos.
- CI, pruebas de integración, pgTAP, E2E, accesibilidad, rendimiento.

## 6. Problemas críticos (P0)

| # | Problema | Dónde | Evidencia |
|---|---|---|---|
| C1 | BD no reconstruible desde el repo; *drift* de esquema | `20260929000000…`, `20260930010000…` | `rebuild_run1.txt` |
| C2 | Pago aprobado no puede marcar pedido `paid` (trigger de inventario falla) | `process_online_order_inventory` | T4 |
| C3 | Cliente autenticado lee **todos** los pedidos (PII) y **modifica pagos** | RLS `order_restricted_read`, `payment_transactions_admin_policy` | T10, T16 |
| C4 | Anon inserta pedidos `paid` sin pasar por la RPC | `order_public_insert WITH CHECK (TRUE)` | T11 |
| C5 | Líneas de pedido guardan precio/nombre enviados por el cliente | RPC de checkout | T1, T12 |
| C6 | OMS y métricas fallan siempre (`packed`); UI usa `preparing` | `update_order_status_oms`, `get_commercial_dashboard_metrics`, `AdminOrdersPage.jsx` | T5b, T6 |
| C7 | Alta de productos no crea variantes/stock/imágenes; usa columna inexistente | `productService.js`, `AdminProductFormPage.jsx` | T8, lectura |
| C8 | Fallback silencioso a catálogo mock ante errores | `productService.js:154-158` | Sondeo navegador |
| C9 | Confirmación de pedido llama RPC inexistente | `OrderConfirmationPage.jsx:96,152` | T7 |
| C10 | Sin CI ni pruebas de integración; informes internos afirman verificación inexistente | repo | doc 28 §6 |

> **Recomendación inmediata al propietario (fuera del alcance de agentes):** revisar en el panel de Wompi si existen transacciones aprobadas cuyos pedidos no figuran como pagados, y evaluar la exposición de datos de C3 en Production. Esta auditoría no pudo verificar Production.

## 7. Trabajo necesario para completar J&M

Resumido (detalle en doc 30): **13 misiones** (24–36) en 5 fases: cimientos (BD reproducible, CI, entornos QA y secretos) → núcleo transaccional (checkout, pago+inventario, confirmación) → catálogo y operación (variantes/imágenes por color, admin real) → experiencia y calidad (móvil, accesibilidad, rendimiento, limpieza) → fábrica en régimen y primer release con aprobación humana.

## 8. Arquitectura recomendada para la fábrica autónoma

(Detalle en doc 29.)
- **Orquestador** + cola de tareas en **GitHub Issues/Projects**.
- **Agentes especialistas:** Arquitecto/Spec, DB, Backend/API, Pagos, Frontend, QA/E2E, Revisor cruzado, Seguridad básica, Release/Docs.
- **Sandbox efímero por tarea:** contenedor + rama/worktree + Supabase local (Docker) + Playwright.
- **Verificación:** GitHub Actions (lint, typecheck, unit, `db reset`+pgTAP, build, E2E) + Vercel Preview ligado a **Supabase QA** y **Wompi Sandbox**.
- **Revisión cruzada obligatoria** por agente distinto; merge automático solo con todo verde.
- **Evidencias** por PR y por misión; tablero de estado.
- **Entrega:** `main` → QA automático; **Production solo por pipeline con aprobación humana y credenciales que ningún agente posee**.

## 9. Orden de ejecución de las siguientes misiones

1. **M24** Línea base de esquema y entorno local (P0)
2. **M25** CI, ramas y gobierno (P0)
3. **M26** Entornos QA y política de secretos (P0) — *con participación humana*
4. **M35 (piloto)** Fábrica mínima operando sobre QA
5. **M27** Checkout y pedidos correctos (incluye RLS de pedidos/pagos)
6. **M28** Pago Wompi e inventario
7. **M30** Catálogo real con variantes, stock e imágenes por color *(en paralelo con 27–28)*
8. **M29** Confirmación, cuenta y notificaciones
9. **M31** Panel administrativo operativo
10. **M33** UX móvil, accesibilidad, rendimiento · **M34** Limpieza de deuda *(paralelo)*
11. **M32** Reseñas, analítica y marketing
12. **M36** Release candidato y salida a Production con aprobación humana

---

## 10. Nota sobre los informes previos del repositorio
`FINAL_PRODUCTION_AUDIT.md`, `GO_LIVE_REPORT.md`, `PRODUCTION_ACTIVATION_REPORT.md`, `LAUNCH_CHECKLIST.md` y `docs/ECOMMERCE_DATABASE_TEST_REPORT.md` contienen afirmaciones de verificación que esta auditoría **contradice con evidencia reproducible**. Se recomienda marcarlos como históricos para que la fábrica de agentes no los use como fuente de verdad.
