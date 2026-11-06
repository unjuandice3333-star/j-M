# 04 — RESULTADOS DE PRUEBAS

Todas las ejecuciones parten de una **exportación limpia** (`git archive 67312b0` + parche M24D, idéntica byte a byte al árbol de trabajo: `diff -r` vacío). El stack se detuvo con `--no-backup` entre reconstrucciones (0 contenedores, 0 volúmenes). **No hubo ningún paso manual entre `supabase db reset` y las pruebas.**

## 1. Matriz de la validación obligatoria

| # | Paso | Reconstrucción 1 | Reconstrucción 2 | Evidencia |
|---|---|---|---|---|
| 1 | `supabase start` | exit 0 | exit 0 | `run*/01_start.log` |
| 2 | `supabase db reset` | exit 0 | exit 0 | `run*/02_reset.log` |
| 3 | Seeds (3 archivos) | OK (detalle §2) | OK | `run*/03_seeds.txt` |
| 4 | `supabase test db` | **exit 0 · 290/290** | **exit 0 · 290/290** | `run*/05_test_db.log` |
| 5 | Concurrencia desde el procedimiento oficial | **12/12** (dentro del paso 4) | **12/12** | ídem |
| 6 | Login de los usuarios sembrados | **4/4** (200) | **4/4** | `run*/06_http_results.json` |
| 7 | Registro de usuario | OK + perfil `customer` | OK | ídem |
| 8 | 39 verificaciones HTTP | **39/39** | **39/39** | `run*/06_http.log` |
| 9 | RLS, Storage, catálogo, checkout, pagos y webhooks simulados, cancelación, transiciones | OK (en 4 y 8) | OK | ídem |
| 10 | pg_cron instalado + expiración automática | Instalado 1.6.4, job activo; **disparo real 06:05:00** | Instalado, job activo | `run1/08_pg_cron_evidence.txt`, `run*/03_seeds.txt` |
| 11 | Determinismo | Instantánea A | Instantánea B: **A = B (7/7)** | `run*/snapshot/checksums_normalized.md5` |
| 12 | Advertencias en registros | 0 | 0 | `run*/07_warnings.txt` |

## 2. Seeds verificados (idénticos en ambas reconstrucciones)
| Dato | Valor |
|---|---|
| Usuarios QA / identidades | 4 / 4 |
| Columnas de token NULL | 0 |
| Perfiles | admin@ → admin · cliente1@ → customer · cliente2@ → customer · superadmin@ → super_admin |
| Productos | active = 6, archived = 1, draft = 1 |
| Variantes / imágenes / cupones / reseñas | 42 / 14 / 7 / 4 |
| Pedidos | JM-001000 delivered 449.700 · JM-001001 processing 174.900 · JM-001002 paid 131.910 · JM-001003 payment_pending 249.900 · JM-001004 expired 174.900 · JM-001005 cancelled 204.900 · JM-001006 refunded 229.900 · JM-001007 cancelled 144.900 |
| pg_cron | `jm-expire-pending-orders */5 * * * * active=true` |

## 3. `supabase test db` por suite (ambas reconstrucciones)
| Suite | Aserciones | Resultado |
|---|---|---|
| 01_structure | 30 | ok |
| 10_catalog | 24 | ok |
| 20_checkout | 34 | ok |
| 30_reservations | 19 | ok |
| 40_payments | 44 | ok |
| 50_cancellations | 22 | ok |
| 60_coupons | 23 | ok |
| 70_transitions | 26 | ok |
| 80_metrics | 10 | ok |
| 90_rls | 46 | ok |
| 95_concurrency | 12 | ok |
| **Total** | **290** | `Files=11, Tests=290, Result: PASS` (exit 0) |

## 4. Verificaciones HTTP (39, ambas reconstrucciones)
| Área | Nº | Ejemplos |
|---|---|---|
| Auth | 10 | Login 4/4, contraseña incorrecta 400, signup 200, perfil por trigger, autoasignación de rol 403, `is_admin` con JWT real |
| Catálogo y RLS | 5 | anon ve 6 activos con embebidos; disponibilidad pública; inventario y cupones 401 para anon; admin lee inventario |
| Productos | 3 | `admin_upsert_product` 200 (admin) / 403 `JM_FORBIDDEN` (cliente); publicación |
| Storage | 5 | Admin sube 200; anon y cliente rechazados; lectura pública 200; PDF rechazado |
| Checkout | 4 | `quote_cart` 144.900; precio manipulado ignorado; idempotencia; `hint` `JM_INVALID_QUANTITY` |
| Pagos y webhooks simulados | 6 | Anon no crea intentos; intento con service_role; APPROVED → paid; reentrega → duplicate; admin no invoca el webhook; `get_order_public` |
| RLS de pedidos y pagos | 3 | anon 401; cliente ve sus 3 pedidos; cliente no modifica pagos |
| Transiciones y cancelación | 3 | `paid → processing`; transición inválida 400; cancelación con reingreso (`lines_restocked = 1`) |
| **Total** | **39** | **39/39 PASS** |

## 5. pg_cron (disparo real, reconstrucción 1)
| Hora UTC | Evento |
|---|---|
| 06:02:39 | `JM-001038` creado (`payment_pending`, 1 reservada); ventana movida al pasado |
| 06:05:00 | Job `jm-expire-pending-orders` → `succeeded`; pedido `expired`; evento `STATUS_CHANGED` actor `system` ("Ventana de pago vencida"); reserva `expired`; `reserved = 0` |

## 6. Determinismo
| Artefacto | md5 (A = B) | ¿Igual a M24C? |
|---|---|---|
| schema_normalized.sql | `07b58d76632b4e2c9a8c919936ce52a6` | Sí |
| privileges.txt | `a7e7cae2dc3ae725089e6e96e0327943` | Sí |
| constraints.txt | `8d8d85756cbe70c71f520e000c61ee94` | Sí |
| functions.txt | `43f40bca0bd346037ab8e1462a2138b1` | Sí |
| policies.txt | `5ec2e5b538f1cbe1df2f7b3ed47b9b46` | Sí |
| reference_data.txt | `9d0f683e428a35b26bc43f2d13d5dc95` | Sí |
| seeds.txt | `9671cd7cff10d8ba1fe57bc5ffb45c10` | Sí |

`schema_normalized` excluye solo el nonce `\restrict` de pg_dump. La coincidencia con M24C demuestra que M24D **no alteró** esquema, funciones, políticas ni datos.

## 7. Regresión adicional (no exigida)
`supabase/tests/run_local.sh` sobre PostgreSQL 16 local (con el shim movido): 278/278 + 12/12, determinismo OK, exit 0 (`evidencias/run_local_pg16.log`).

## 8. Ejecución previa a la corrección H2b (registrada, no ocultada)
En la primera validación de M24D, `supabase test db` dio 290/290 en las 11 suites, pero `Result: FAIL` porque también ejecutó el shim (`evidencias/precorreccion_test_db_con_shim.log`). Se corrigió moviendo el shim y se repitió **todo** desde cero. Los resultados de las secciones 1–6 son posteriores a esa corrección.
