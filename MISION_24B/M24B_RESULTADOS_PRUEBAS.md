# M24B — RESULTADOS DE PRUEBAS · J&M FASHION STORE

## 1. Entorno de ejecución

| Elemento | Valor |
|---|---|
| Motor | PostgreSQL 16.15 (local, clúster efímero creado por `run_local.sh`) |
| Extensiones | pgTAP 1.3.2, pg_cron 1.6.2, pgcrypto, dblink |
| Compatibilidad Supabase | `supabase/tests/local_shim/supabase_shim.sql`: roles, `auth.users`, `auth.uid()` / `role()` / `jwt()` idénticos a Supabase, privilegios por defecto de Supabase, storage mínimo |
| Remotos | **Ninguno.** Sin Supabase QA ni Production, Vercel ni Wompi |
| Comando | `su postgres -c "cd <repo> && ./supabase/tests/run_local.sh"` |
| Fecha | 2026-11-06 |

## 2. Resultado global

| Paso | Resultado | Evidencia |
|---|---|---|
| 1. Reconstrucción desde cero (shim → migración base → 3 seeds) | **OK**, sin errores ni advertencias. Autoverificación de la base superada | `evidencias/rebuild.log` |
| 2. Pruebas pgTAP funcionales (10 suites) | **278 / 278 OK** | `evidencias/pgtap.log` |
| 3. Concurrencia real (2 conexiones con `dblink`) | **12 / 12 OK** | `evidencias/concurrency.log` |
| 4. Determinismo (dos reconstrucciones independientes) | **Huella idéntica** | `evidencias/run_local_console.txt` |
| **Total** | **290 aserciones, 0 fallos**, código de salida 0 | `evidencias/listado_pruebas_ok.txt` |
| Cobertura de ejecución de funciones | 31 de 32 con llamadas registradas; la restante (`forbid_mutation`) verificada por excepción | `evidencias/llamadas_por_funcion.txt` |

### Por suite
| Suite | Aserciones | Tema |
|---|---|---|
| `01_structure` | 30 | Tablas exactas, sin POS, RLS en todo, `search_path`, EXECUTE por rol, privilegios, datos de referencia, restricciones, *append-only* |
| `10_catalog` | 24 | Crear/actualizar producto, SKU, color por defecto, galería por color, stock inicial, visibilidad, publicación, validaciones, permisos, ajuste manual |
| `20_checkout` | 34 | Cotización y envío, precio manipulado ignorado, snapshot, `user_id`, agrupación, idempotencia, 12 validaciones de entrada |
| `30_reservations` | 19 | Reserva, disponibilidad, bloqueo del segundo comprador, expiración, liberación, pago fuera de ventana, permisos, pg_cron |
| `40_payments` | 44 | Aprobado, duplicado, reentrega, rechazado + reintento, 6 rechazos de validación, aprobación tardía con/sin stock, doble aprobación, pago sobre cancelado, anulación |
| `50_cancellations` | 22 | Cancelación por cliente/invitado/admin, reingreso de stock, reembolsos, terminalidad, devolución posventa |
| `60_coupons` | 23 | Validación (9 casos), error explícito, prorrateo, umbral de envío con descuento, envío gratis, límites por correo y globales, `used_count` al pagar |
| `70_transitions` | 26 | Catálogo de estados, transiciones inválidas, notas, guía, camino feliz, línea de tiempo auditada, consulta pública por token |
| `80_metrics` | 10 | Ventas, pedidos, ticket, unidades, estados, stock bajo, actualización con nuevo pago, permisos |
| `90_rls` | 46 | Matriz anon / cliente / admin / super_admin / service_role, regresiones M23, storage |
| `95_concurrency` | 12 | Dos compradores y una unidad; webhook duplicado en paralelo |

## 3. Validaciones exigidas en la misión

| # | Validación | Resultado | Aserciones clave |
|---|---|---|---|
| 1 | Reconstrucción desde cero | **OK**: migración base + seeds en BD vacía, dos veces, con resultado idéntico | `rebuild.log`, determinismo |
| 2 | Creación de productos y variantes | **OK** | `10_catalog` 1–8, 14–20 |
| 3 | Compra con precios correctos | **OK**: payload con `price: 1` produce cabecera y línea con 129.900 de BD | `20_checkout` 6–9 |
| 4 | Reserva y expiración de inventario | **OK**: reserva 30 min, segundo comprador bloqueado, expiración libera | `30_reservations` 1–13 |
| 5 | Pago aprobado | **OK**: pedido `paid`, stock 5→3, reserva consumida, movimiento `sale` | `40_payments` 5–10 |
| 6 | Pago rechazado | **OK**: pedido sigue pendiente con reserva, reintento con referencia `-2` aprobado | `40_payments` 18–24 |
| 7 | Webhook duplicado | **OK**: mismo checksum → `duplicate`; reentrega → `ignored`; en paralelo → uno `applied` y otro `duplicate`, un solo movimiento | `40_payments` 11–15, `95_concurrency` 9–12 |
| 8 | Cancelación y devolución de stock | **OK**: pendiente libera reserva; pagado reingresa (5→8) con `cancel_restore` y `order_refunds` | `50_cancellations` |
| 9 | Concurrencia: dos compradores, una unidad | **OK con conexiones reales**: B espera el bloqueo de A, recibe "Stock insuficiente", un solo pedido, stock 1 / reservado 1 | `95_concurrency` 1–8 |
| 10 | Aplicación de cupones | **OK**: porcentaje, fijo, envío gratis, mínimos, vencido, futuro, agotado, por correo, global con reservas, `used_count` solo al pagar | `60_coupons` |
| 11 | Transiciones válidas e inválidas | **OK**: 13 válidas definidas; inválidas rechazadas con `JM_INVALID_TRANSITION`; nota y guía exigidas | `70_transitions` |
| 12 | Acceso diferenciado por roles | **OK**: 46 aserciones de RLS y privilegios + EXECUTE por rol | `90_rls`, `01_structure` |

## 4. Defectos encontrados y corregidos durante la misión

Política aplicada: "si alguna prueba falla, corregir y repetir". Todos los defectos se corrigieron y la suite completa se volvió a ejecutar desde cero.

### 4.1 En la línea base (SQL)
| # | Defecto | Cómo se detectó | Corrección |
|---|---|---|---|
| 1 | `create_order` leía el registro del cupón sin asignar cuando no se enviaba cupón (error en tiempo de ejecución) | Revisión antes de ejecutar | Variables explícitas `v_coupon_ok/id/code` |
| 2 | La protección del rol en `profiles` usaba `session_user`; detrás de PostgREST eso habría podido debilitar el control | Revisión | `current_user` (+ privilegio por columna) |
| 3 | `quote_cart` y `validate_coupon` declaradas `STABLE` invocaban una función que escribe una tabla temporal | Revisión | Volátiles |
| 4 | `jsonb_object_agg` con clave enum | Revisión | `::text` |
| 5 | Conteo de usos de cupón duplicado (`used_count` + redenciones confirmadas) | Revisión de la lógica | Usos = `used_count` + reservas vigentes |
| 6 | Movimientos en la misma transacción con la misma marca de tiempo (orden ambiguo) | Prueba `50_cancellations` #14 | `created_at DEFAULT clock_timestamp()` |
| 7 | `NOTICE` ruidosos por `CREATE TEMP TABLE IF NOT EXISTS` | Ejecución de seeds | Verificación con `to_regclass` |

### 4.2 En las pruebas (no en el esquema)
- **Fixture con nombre de 1 carácter.** Lo rechazaba correctamente la restricción de longitud del nombre.
- **`ORDER BY` sobre un alias de texto.** Ordenaba alfabéticamente en lugar de por el valor del enum.
- **DML dentro de subconsultas (SQLSTATE `0A000`).** PostgreSQL no lo admite; el helper pasó a una CTE de nivel superior.
- **Errores de redacción de las pruebas:**
  - tipos del helper de intentos de pago;
  - sintaxis de `FILTER` con conversión de tipo;
  - comillas mal anidadas;
  - número de filas esperado en una línea de tiempo;
  - conteos de `plan()`.

## 5. Limitaciones y lo que NO se verificó

| Aspecto | Estado | Riesgo / siguiente paso |
|---|---|---|
| Ejecución con **Supabase CLI + Docker** (`supabase db reset`, GoTrue, Storage reales) | **No verificado.** El contenedor no tiene daemon de Docker | Ejecutar `supabase start && supabase db reset && supabase test db` en un equipo con Docker; esperado: mismo resultado |
| Seeds de `auth.users` contra el esquema real de GoTrue | Validado solo contra el shim (columnas estándar) | Puede requerir columnas adicionales según la versión de Supabase; verificar con CLI |
| Disparo real del job pg_cron | Programación verificada (`cron.job`); ejecución periódica no observada (las pruebas llaman la función directamente) | Observar en QA |
| Eventos de Wompi | **Sintéticos** (estructura oficial `transaction.updated`) | La firma la verifica Vercel; probar con Wompi Sandbox en la misión de integración |
| Formato de referencia por intento `JM-001234-2` en Wompi | No verificado | Confirmar en Sandbox |
| Rendimiento y carga | No medido | Fuera de alcance |
| Frontend y backend actuales | **Incompatibles** con la nueva base (esperado) | Ver `M24B_COMPATIBILIDAD_FRONTEND_BACKEND.md` |

## 6. Cómo reproducir
```bash
apt-get install -y postgresql-16 postgresql-16-pgtap postgresql-16-cron
su postgres -c "cd /ruta/al/repo && ./supabase/tests/run_local.sh"
# KEEP=1 conserva el clúster; los logs quedan en $WORKDIR/out
```
