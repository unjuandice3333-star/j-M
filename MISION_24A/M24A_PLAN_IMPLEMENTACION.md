# M24A — PLAN DE IMPLEMENTACIÓN · J&M FASHION STORE

**Estado:** propuesta. **Nada de este plan se ha ejecutado.** Requiere autorización explícita antes de iniciar M24B.
**Estrategia adoptada (propuesta):** C' híbrida (`M24A_ESTRATEGIA_MIGRACIONES.md` §2): línea base consolidada en el repositorio, QA recreado y ruta de Production decidida tras un diagnóstico de solo lectura.

---

## 1. Principio de secuencia

El esquema objetivo **cambia contratos** que hoy usa el frontend (RPC, columnas, estados). Por eso:
1. La base y sus pruebas se construyen y validan **solo en local/CI** primero.
2. El frontend se adapta en una rama coordinada.
3. Solo cuando base + frontend adaptado pasan juntos E2E se despliega a **QA-v2**, un proyecto Supabase nuevo para el esquema nuevo. El QA actual queda intacto mientras tanto.
4. Production se decide al final, con evidencia.

```
M24A (diseño) ─► M24B base+seeds+pgTAP (local/CI) ─► M24C RPC núcleo ─► M24D contrato FE↔BD
       │                                                            │
       └─► M24-DIAG diagnóstico solo lectura (humano) ──────────────┴─► M24E QA-v2 ─► (M27–M31 adaptación funcional)
                                                                                   └─► M24F decisión y ensayo ruta Production
```

---

## 2. Sub-misiones

### M24-DIAG — Diagnóstico de entornos remotos (humano autorizado, solo lectura) · P0
| Tarea | Responsable | Salida |
|---|---|---|
| `supabase migration list --linked` en QA y Production | Humano | Lista de versiones aplicadas |
| `supabase db dump --linked --schema-only` en QA y Production | Humano | `schema_qa.sql`, `schema_prod.sql` (sin datos) |
| Consultas de integridad de solo lectura (ver ESTRATEGIA §5.0) y conteos por tabla | Humano (consultas preparadas por agente) | `DIAGNOSTICO_<entorno>.md` |
| Conciliación Wompi: aprobadas vs pedidos `paid` | Humano | Lista de discrepancias |
| Análisis de diferencias `schema_*.sql` vs esquema objetivo | Agente (sobre archivos entregados, sin credenciales) | `M24_DRIFT_REPORT.md` |

**Terminado cuando:** existe el informe de *drift* y se decide DP-9 (ruta Production) y P1 (si QA se puede recrear).
**Puede ir en paralelo** con M24B.

### M24B — Línea base, entorno local y seeds · P0
| # | Tarea | Criterio de aceptación |
|---|---|---|
| B1 | Archivar las 16 migraciones en `supabase/migrations_legacy/` con README y etiqueta `db-legacy-final` | Archivos intactos (mismo hash git); README con mapa a la matriz |
| B2 | `supabase/config.toml` (puertos, `[db.seed] sql_paths`, auth local con email + Google desactivado en local) | `supabase start` levanta |
| B3 | Migración `…_baseline_ecommerce.sql` con el orden de ESTRATEGIA §4.2: tablas, enums, índices, vistas, RLS, grants, buckets y datos de referencia | `supabase db reset` sin errores |
| B4 | Bloque de autoverificación al final de la base | Falla si alguna tabla `public` no tiene RLS, alguna `SECURITY DEFINER` no tiene `search_path`, o hay desalineación enum ↔ transiciones |
| B5 | Seeds QA (`seeds/00…20`) con UUID v4 deterministas (ESQUEMA §9) | Reset reproducible: mismo resultado en 2 ejecuciones (hash de un `pg_dump --data-only` ordenado) |
| B6 | pgTAP — estructura: tablas, columnas, FKs, CHECK, índices únicos parciales (incluye los 12 casos ya probados en el borrador) | Verde en local y CI |
| B7 | pgTAP — RLS por rol: anon, cliente1, cliente2, admin, super_admin, service_role en cada tabla (matriz ESQUEMA §8) | Verde; incluye regresiones M23 T9–T11, T14, T16 |

**Terminado cuando:** `supabase db reset && supabase test db` verde en local **y** en CI (requiere la CI mínima de M25; si M25 aún no existe, se incluye un workflow mínimo dentro de M24B).

### M24C — RPC del núcleo transaccional · P0
| # | Tarea | Criterio de aceptación (pgTAP) |
|---|---|---|
| C1 | `quote_cart`, `validate_coupon` | Totales iguales a `create_order` para los mismos datos; cupones QA10/QAFIJO20K/QAENVIO/QAEXPIRADO/QAAGOTADO/QAFUTURO |
| C2 | `create_order` (reserva + cupón + snapshot desde BD + `auth.uid()`) | Precio manipulado ignorado en cabecera **y** líneas; idempotencia; stock insuficiente ⇒ error de negocio; `p_user_id` no existe como parámetro |
| C3 | `transition_order` + tabla de transiciones + efectos | Cada transición permitida pasa; cada no permitida falla; efectos de stock/cupón/fechas correctos |
| C4 | `create_payment_attempt`, `apply_payment_event`, `webhook_events` | Aprobado ⇒ `paid` + venta + cupón confirmado; duplicado ⇒ sin efectos; rechazado ⇒ pedido sigue `payment_pending`, se permite intento 2; DECLINED tardío no degrada `paid`; monto/moneda incorrectos ⇒ `rejected`; aprobado sobre `expired` ⇒ regla PAID_WITHOUT_STOCK |
| C5 | `expire_pending_orders` (+ programación `pg_cron` o cron externo, DP-1) | Reservas y cupones liberados; pedido `expired` |
| C6 | **Concurrencia**: 2 sesiones compran la última unidad (P4) | Exactamente 1 pedido reserva; el otro recibe error de stock; sin *deadlock* (prueba con `dblink` o script con 2 conexiones) |
| C7 | `get_order_public`, `get_order_status_catalog`, `cancel_my_order` | Token incorrecto ⇒ nada; catálogo coincide con el enum |
| C8 | Admin: `admin_upsert_product`, `admin_set_product_status`, `admin_adjust_inventory`, `admin_dashboard_metrics`, `admin_upsert_coupon`, `admin_moderate_review`, `admin_set_site_content`, `admin_set_user_role` | Cliente ⇒ denegado; admin ⇒ OK; super_admin requerido para roles |

**Terminado cuando:** todas las RPC con `GRANT` explícito y pruebas verdes; cobertura de las 16 regresiones de M23 (T1–T16) con el resultado **correcto**.

### M24D — Contrato frontend ↔ BD · P0
| # | Tarea | Criterio |
|---|---|---|
| D1 | `supabase gen types typescript --local > packages/db-types/database.ts` en CI | Tipos regenerados sin diferencias (`git diff --exit-code`) |
| D2 | Verificación automática: cada `.from('x')`, `.rpc('y')` y columna usada en servicios del frontend existe en los tipos | Script de CI falla ante referencias inexistentes (habría detectado `style_line_id`, `get_order_status`, `profiles.email`, `preparing`) |
| D3 | Constantes de estados en el frontend generadas desde el enum | Sin literales de estado escritos a mano |

### M24E — Entorno QA-v2 · P0 (requiere M26: secretos y entornos)
| # | Tarea | Responsable |
|---|---|---|
| E1 | Crear proyecto Supabase **QA-v2**; aplicar base con `db push`; cargar seeds QA | Humano crea el proyecto; agente aplica con credenciales **solo de QA-v2** |
| E2 | Vercel Preview de la rama de adaptación apuntando a QA-v2 | Humano/agente con token limitado a preview |
| E3 | Wompi Sandbox: llaves de prueba, webhook a la URL de Preview/QA | Humano |
| E4 | `supabase db diff --linked` vacío | Agente |

**Terminado cuando:** QA-v2 reproduce exactamente la base y los seeds, sin *drift*. **Despliegue de frontend sobre QA-v2 solo tras la adaptación de M27–M31.**

### M24F — Ruta de Production (decisión, ensayo y documentación; **sin ejecución**) · P1
| # | Tarea | Criterio |
|---|---|---|
| F1 | Elegir C-ETL o B-bridge con el informe de *drift* (DP-9) | Decisión registrada por el propietario |
| F2 | Escribir el ETL (o el *bridge*) + validaciones de conteos y sumas | Revisado por agente revisor y por humano |
| F3 | Ensayo sobre **copia** restaurada de Production (operada por humano) | Conteos/sumas/stock cuadran; usuarios de prueba inician sesión |
| F4 | Runbook de corte y *rollback* | Documento aprobado |

**La ejecución en Production pertenece a M36 (release) y requiere aprobación humana.**

---

## 3. Relación con el plan maestro (doc 30)

| Plan maestro | Cambio propuesto |
|---|---|
| M24 "Línea base de esquema y entorno local" | Se divide en **M24A (este diseño)**, **M24-DIAG**, **M24B**, **M24C**, **M24D**, **M24E**, **M24F** |
| M25 CI | M24B necesita al menos un workflow mínimo (`db reset` + pgTAP); M25 lo amplía |
| M26 QA y secretos | Prerrequisito de M24E |
| M27 Checkout / M28 Pagos | Su parte de BD queda absorbida por M24C; M27/M28 se enfocan en frontend, API Vercel y pruebas E2E con Sandbox |
| M30 Catálogo / M31 Admin | Consumen el modelo de catálogo y las RPC admin de M24C |

Orden recomendado: **M24-DIAG ∥ M24B → M24C → M24D → (M25 completo, M26) → M24E → M27–M31 → M24F → M36**.

---

## 4. Estimación (orientativa, en días de fábrica)

| Sub-misión | Tamaño |
|---|---|
| M24-DIAG | S (depende de disponibilidad humana) |
| M24B | M |
| M24C | L |
| M24D | S |
| M24E | S (+ tiempo humano) |
| M24F | M–L (según ruta) |

---

## 5. Riesgos del plan

| Riesgo | Mitigación |
|---|---|
| El diagnóstico revela tablas/datos en Production no contemplados (p. ej. columnas `slug`, `images`, `style_line_id` con datos) | El ETL los mapea; la matriz se actualiza antes de M24F |
| Periodo largo con QA antiguo y QA-v2 conviviendo | QA antiguo congelado en solo lectura; nada nuevo se prueba allí |
| Frontend actual deja de ser compatible con el repo tras merge de la base | La base vive en rama `db/baseline` hasta que la adaptación del frontend esté lista; **o** se fusiona en `main` sin desplegar a ningún entorno compartido (Vercel apunta al QA antiguo) — decisión P3 |
| Concurrencia y *deadlocks* no detectados por pruebas unitarias | Prueba C6 obligatoria con conexiones reales concurrentes |
| `pg_cron` / Storage difieren entre local y Cloud | Probar en QA-v2 antes de dar por cerrada M24E |

---

## 6. Decisiones pendientes para autorizar M24B

| ID | Pregunta | Recomendación |
|---|---|---|
| P1 | ¿QA actual contiene datos que deban preservarse? | Se asume que no; recrear como QA-v2 |
| P2 | ¿Quién ejecuta M24-DIAG (persona con acceso de solo lectura a Production)? | El propietario |
| P3 | ¿La base se fusiona en `main` antes de adaptar el frontend o vive en rama hasta la adaptación? | Rama `db/baseline` + rama de adaptación; merge conjunto |
| P4 | Aprobar alternativa C' (base consolidada + QA recreado + ruta Production tras diagnóstico) | Aprobar |
| DP-1…DP-17 | Decisiones de negocio y modelo | Ver `M24A_ESQUEMA_OBJETIVO.md` §11; las críticas para M24B son **DP-1** (reservas), **DP-2** (contraentrega), **DP-3** (envíos), **DP-6** (género), **DP-10** (carrito en servidor), **DP-12** (ubicación del webhook) y **DP-13** (tipo monetario) |

---

## 7. Criterio de finalización de la Misión 24 completa

1. `supabase db reset` reconstruye desde cero el esquema objetivo, sin errores, en local y CI.
2. pgTAP verde: estructura, RLS por rol, RPC del núcleo, concurrencia y las 16 regresiones de M23 con el resultado correcto.
3. Contrato FE↔BD verificado automáticamente en CI.
4. QA-v2 sin *drift* respecto al repositorio.
5. Ruta de Production decidida, ensayada sobre copia y documentada (ejecución en M36).
