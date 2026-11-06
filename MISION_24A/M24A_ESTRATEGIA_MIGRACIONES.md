# M24A — ESTRATEGIA DE MIGRACIONES Y RECONSTRUCCIÓN · J&M FASHION STORE

**Punto de partida verificado (M23):**
- 16 migraciones; **14 aplican y 2 fallan** desde cero: `20260929000000_cleanup_pos_architecture` por dependencias de la vista materializada, FKs y políticas, y `20260930010000_fix_sizes_colors_rls_and_order_branch` por la columna `online_orders.branch_id` inexistente.
- El código depende de columnas que ninguna migración crea. Hay *drift* probable entre repositorio y remoto.
- No existen `supabase/config.toml` ni seeds.

**Premisa de esta misión:** no se asume que QA ni Production sean correctos, ni que coincidan entre sí o con el repositorio.

---

## 1. Requisitos que debe cumplir la estrategia

| # | Requisito |
|---|---|
| R1 | `supabase db reset` reconstruye el esquema objetivo completo **desde cero**, sin errores, en local y en CI |
| R2 | El repositorio es la **única fuente de verdad** del esquema; cualquier diferencia remota se detecta (`db diff`) |
| R3 | Entornos nuevos (local, CI, ramas de preview, QA recreado) no heredan objetos POS ni errores históricos |
| R4 | Entornos existentes con datos (Production) se migran **sin pérdida** de pedidos, pagos, productos, stock y usuarios |
| R5 | Historial auditable: se conserva qué existió antes y cómo se transformó |
| R6 | Compatible con Supabase CLI: `migration list`, `db push`, `migration repair`, `db diff`, Branching/GitHub |
| R7 | Production solo se toca con aprobación humana y respaldo verificado; los agentes no tienen credenciales de Production |
| R8 | Reversible: existe un camino de vuelta probado |

---

## 2. Alternativas evaluadas

### A. Reparar las migraciones históricas
Editar `20260929000000`, `20260930010000` (y las que hagan falta) para que la cadena aplique desde cero:
- añadir `DROP MATERIALIZED VIEW`, `DROP POLICY` correctos y `CASCADE`;
- añadir las columnas faltantes;
- después, nuevas migraciones incrementales hacia el esquema objetivo.

| Ventajas | Riesgos / desventajas |
|---|---|
| Conserva los números de versión que ya existen en `supabase_migrations.schema_migrations` remoto | **Editar migraciones ya aplicadas** hace que el repo diga una cosa y el remoto haya ejecutado otra; Supabase no vuelve a ejecutar una versión ya registrada ⇒ el *drift* persiste en silencio |
| Cambio "pequeño" a corto plazo | No conocemos qué versiones y qué SQL se aplicaron realmente en QA/Production (hubo cambios manuales) |
| | La cadena seguiría creando y destruyendo POS, con 3–4 reescrituras de las mismas funciones: lenta, frágil y confusa para agentes |
| | Cada reconstrucción ejecuta código muerto; cualquier error futuro en una migración vieja rompe CI |
| | No resuelve el modelo (imágenes por color, reservas, pagos por intento): igual hay que escribir todo el esquema nuevo encima |

**Compatibilidad Supabase:** técnicamente posible, pero contradice la práctica de no modificar migraciones aplicadas. **No recomendada.**

### B. Línea base consolidada + transición para entornos existentes
1. Archivar las 16 migraciones en `supabase/migrations_legacy/` sin borrarlas; quedan en git y en una etiqueta.
2. Crear **una** migración base `YYYYMMDDHHMMSS_baseline_ecommerce.sql` que construye el esquema objetivo completo (M24A_ESQUEMA_OBJETIVO) más los datos de referencia.
3. Las nuevas funcionalidades se agregan como migraciones incrementales posteriores.
4. Para entornos **existentes**:
   - un script de **transición** (*bridge*), revisado por un humano, transforma esquema y datos actuales al objetivo;
   - luego se ajusta el historial con `supabase migration repair`: versiones antiguas a `reverted` y base a `applied`.

| Ventajas | Riesgos / desventajas |
|---|---|
| Cumple R1–R3 de forma directa; esquema legible para humanos y agentes | El *bridge* debe escribirse contra el esquema **real** de cada entorno: requiere volcado previo solo de esquema |
| Es el patrón que Supabase documenta para "squash" e historiales rotos (`migration repair`) | Transformación *in situ* de Production: si falla a medias, hace falta restaurar copia |
| Las ramas de preview / Branching de Supabase crean BD limpias desde el repo | El *bridge* es código de un solo uso, difícil de probar sin una copia fiel de Production |
| Los cambios futuros vuelven a ser incrementales normales | |

**Compatibilidad Supabase:** alta (`migration repair`, `db push`, Branching).

### C. Línea base consolidada + **proyecto nuevo** y migración de datos (ETL)
Igual que B en el repositorio. Para Production no se transforma *in situ*:
- se crea un **proyecto Supabase nuevo** desde la base;
- se copian los datos de negocio con un ETL validado: catálogo, stock, pedidos, pagos y usuarios de `auth`;
- se cambia el frontend y el webhook de Wompi al proyecto nuevo en una ventana corta de congelamiento.

| Ventajas | Riesgos / desventajas |
|---|---|
| Production actual queda **intacta**: *rollback* = volver a apuntar variables | Migrar `auth.users` (contraseñas con hash, identidades Google) requiere procedimiento cuidadoso y misma versión de Auth |
| El ETL se ensaya N veces contra copias, de forma determinista | Nuevas claves y URL: actualizar Vercel, Wompi (webhook), OAuth (redirect URIs) |
| Sin `migration repair` en Production: historial limpio desde el día 1 | Ventana de congelamiento de pedidos (minutos u horas) |
| Permite validar la tienda nueva en el proyecto nuevo **antes** del corte | Costo de un proyecto adicional durante la transición |

**Compatibilidad Supabase:** alta; no depende de reescribir historial.

### C'. Variante híbrida (recomendada)
- **Repositorio:** B (línea base consolidada).
- **Local, CI y Preview:** solo base + seeds.
- **QA:** **recrear** desde cero, o crear un proyecto QA nuevo. QA no contiene datos de valor que preservar (a confirmar, ver P1).
- **Production:** decidir entre **B-bridge** y **C-ETL** con datos objetivos del volcado de solo lectura (§5). Por defecto, **C-ETL** si el volumen es pequeño, el *drift* es amplio o la integridad de datos es dudosa. Esto es probable según M23: líneas con precio del cliente, pedidos insertables por anon y pedidos no marcados como pagados.

---

## 3. Comparación

| Criterio | A. Reparar | B. Base + bridge | C. Base + proyecto nuevo | C'. Híbrida |
|---|---|---|---|---|
| Reconstrucción desde cero (R1) | Parcial (frágil) | Sí | Sí | Sí |
| Repo como fuente de verdad (R2) | No (el remoto ejecutó otra cosa) | Sí, tras repair | Sí | Sí |
| Elimina legado POS (R3) | No (lo crea y destruye) | Sí | Sí | Sí |
| Preserva datos de Production (R4) | Sí (sin transformar) | Sí (transformación *in situ*) | Sí (copia) | Sí |
| Historial auditable (R5) | Confuso | Sí (legacy archivado + bridge) | Sí | Sí |
| Supabase CLI / Branching (R6) | Débil | Alta | Alta | Alta |
| Riesgo sobre Production (R7) | Medio | **Alto** (cambio *in situ*) | **Bajo** (original intacta) | Bajo/medio según decisión |
| Reversibilidad (R8) | Baja | Restaurar backup / PITR | Cambiar variables | Alta |
| Esfuerzo | Medio, recurrente | Alto (bridge) | Alto (ETL + auth) | Alto |
| Adecuación a fábrica de agentes | Mala | Buena | Buena | **La mejor** |

**Recomendación: C' (híbrida).**

---

## 4. Diseño de la línea base

### 4.1 Estructura de archivos propuesta (a crear en la misión de implementación)
```
supabase/
  config.toml                      # proyecto local, puertos, [db.seed] sql_paths
  migrations/
    20261110000000_baseline_ecommerce.sql   # (fecha de ejemplo) esquema objetivo + datos de referencia
  migrations_legacy/
    README.md                      # por qué se archivaron, mapa objeto viejo → objeto nuevo
    20260508000000_init_schema.sql … 20261001010000_….sql   (las 16, intactas)
  seeds/
    00_qa_users.sql
    10_qa_catalog.sql
    20_qa_orders.sql
  tests/
    database/*.test.sql            # pgTAP
  bridge/                          # solo si se elige B para algún entorno
    YYYYMMDD_bridge_<entorno>.sql
```
Etiqueta git `db-legacy-final` sobre el último commit antes del archivo.

### 4.2 Orden interno de la migración base
1. Extensiones (`pgcrypto` si hace falta; `pg_cron` solo si DP-1 = sí).
2. Enums.
3. Funciones utilitarias sin dependencias: `set_updated_at`, `is_admin`, etc.
4. Tablas por dominio, en orden de dependencia: identidad → catálogo → inventario → comercial → pedidos → pagos → contenido.
5. Índices, incluidos los únicos parciales.
6. Vistas `security_invoker`.
7. Funciones de negocio (RPC).
8. Triggers.
9. RLS: `ENABLE` en **todas** las tablas `public`, políticas.
10. Privilegios: `REVOKE ALL ON FUNCTION … FROM PUBLIC` y luego `GRANT EXECUTE` explícito por función y rol, sin `REVOKE … ON ALL FUNCTIONS` global.
11. Storage: buckets y políticas.
12. Datos de referencia con UUID fijos v4 válidos (`ON CONFLICT DO NOTHING`).
13. Bloque de **autoverificación** al final (`DO $$ … ASSERT …`): RLS activa en todas las tablas, ninguna función `SECURITY DEFINER` sin `search_path`, enum de estados igual a la tabla de transiciones.

### 4.3 Reglas para migraciones posteriores
- Nunca editar una migración ya fusionada en `main`.
- Cada PR con migración debe incluir pruebas pgTAP y pasar `db reset` en CI.
- Prohibido `REVOKE … ON ALL FUNCTIONS`, `DROP … CASCADE` sin lista explícita, y emails o UUIDs de personas reales.
- Cambios destructivos (DROP COLUMN, cambio de tipo) en dos pasos: expandir → migrar datos → contraer.

---

## 5. Transición segura por entorno

### 5.0 Diagnóstico previo (humano autorizado, **solo lectura**)
Antes de decidir la ruta de Production, una persona autorizada ejecuta en QA y en Production. Ningún agente lo hace.
- `supabase migration list --linked`: versiones registradas en remoto frente al repo.
- `supabase db dump --linked --schema-only -f schema_<entorno>.sql`: esquema real.
- Conteos por tabla y verificaciones de integridad de solo lectura:
  - pedidos `paid` sin `payment_transactions APPROVED`;
  - transacciones `APPROVED` con pedido no pagado;
  - líneas cuyo `unit_price` difiere del precio de la variante;
  - pedidos con `total ≠ subtotal − discount + shipping`;
  - inventario negativo o huérfano.
- Conciliación con el panel de Wompi: transacciones aprobadas frente a pedidos.

Resultado: `DIAGNOSTICO_<entorno>.md` + `schema_<entorno>.sql`, guardados fuera del alcance de agentes si contienen datos sensibles. Los volcados de esquema no contienen datos.

### 5.1 Local / CI / Preview
`supabase start` + `supabase db reset`: base, seeds y pgTAP. Nada que migrar.

### 5.2 QA
> **Nota M26-R1:** para el proyecto QA existente (`yomgxdjgfjnrjaqiarvw`) este apartado queda **sustituido** por
> `MISION_26/06_T6_QA.md` §3: copia de seguridad, inventario, historial de migraciones y versión antes de nada;
> `db push` no destructivo cuando sea posible; `db reset` solo con decisión escrita del propietario. Con Supabase CLI 3.x
> se usa `--remote=<ref>` explícito en lugar de `supabase link`/`--linked`. El paso 3 de abajo («`db push` tras recrear»)
> es redundante tras un `reset`, que ya aplica las migraciones.

1. Confirmar con el propietario que QA no tiene datos que preservar (P1).
2. Recrear: proyecto QA nuevo, o reset completo del QA actual.
3. `supabase link` + `supabase db push`: aplica solo la base.
4. Cargar seeds de QA.
5. Desplegar el frontend de Preview apuntando a QA y registrar el webhook de Wompi Sandbox.
6. Si se reutiliza el proyecto QA existente sin recrearlo: `supabase migration repair --status reverted <16 versiones>` después del reset, para que `migration list` quede limpio.

### 5.3 Production — Ruta C-ETL (recomendada por defecto)
1. Crear el proyecto `jm-prod-v2` y aplicar la base (sin seeds de QA).
2. Escribir el ETL `legacy → v2` como SQL o script versionado en `supabase/etl/`, con mapeos:
   - `products/variants` → `products`, `product_colors`, `product_images` (desde `variants.image_url`), `variants`;
   - categorías, mapeadas a slugs;
   - `inventories`, con `reserved = 0`;
   - `online_orders` → montos a `bigint`, `branch_id` por defecto, `public_token` nuevo, `idempotency_key` nula → `legacy-<id>`;
   - `online_order_items`, conservando los datos históricos tal cual, con una bandera `legacy_unverified_price` si difieren (DP-17);
   - `payment_transactions` → un intento por fila, `reference = transaction_reference`;
   - `order_events`, `profiles`, `customer_addresses`, `coupons`;
   - `auth.users` + `auth.identities`, mediante el procedimiento de migración de usuarios de Supabase.
3. Ensayar el ETL **contra una copia** de Production: un proyecto temporal restaurado desde backup, operado por un humano. Validar conteos, sumas de importes, stock total por variante e inicio de sesión de usuarios de prueba.
4. Ventana de corte:
   - modo mantenimiento en la tienda;
   - ETL final;
   - verificación automática;
   - cambio de variables en Vercel Production, webhook de Wompi Production y redirect URIs OAuth;
   - smoke tests no transaccionales.
5. *Rollback*: revertir variables al proyecto antiguo, que sigue intacto, y conciliar los pedidos creados durante el corte (debería ser cero).
6. Mantener el proyecto antiguo en solo lectura durante N semanas y luego archivarlo.

### 5.4 Production — Ruta B-bridge (si el diagnóstico lo justifica)
1. Backup verificado y PITR activo.
2. El *bridge* se genera contra `schema_prod.sql` y se ensaya sobre una restauración de Production.
3. Pasos del *bridge*:
   - crear las tablas y columnas nuevas;
   - migrar datos;
   - crear funciones y políticas nuevas;
   - eliminar POS;
   - eliminar funciones antiguas.
4. Ajustar historial:
   - `supabase migration repair --status reverted` para las 16 versiones heredadas;
   - `supabase migration repair --status applied <baseline>`.
5. Verificación: `supabase db diff --linked` contra el repositorio debe salir vacío.
6. *Rollback*: restaurar backup o PITR al instante previo.

---

## 6. Conservación del historial

| Qué | Cómo |
|---|---|
| SQL histórico | `supabase/migrations_legacy/` (16 archivos intactos) + etiqueta git `db-legacy-final` |
| Razón del cambio | `migrations_legacy/README.md` + este documento + M23/26 |
| Mapa objeto viejo → nuevo | `M24A_MATRIZ_COMPATIBILIDAD.md` (columna Acción) |
| Historial remoto | `supabase_migrations.schema_migrations` en remoto: versiones antiguas marcadas `reverted` (B) o proyecto antiguo archivado (C) |
| Esquema real previo | `schema_<entorno>.sql` del diagnóstico 5.0 |
| Datos históricos | Copiados tal cual por el ETL, con banderas de calidad cuando no sean verificables |

---

## 7. Controles de verificación (puertas)

| Puerta | Cuándo | Criterio |
|---|---|---|
| G1 Base compila | Cada PR | `supabase db reset` sin errores |
| G2 Pruebas BD | Cada PR | pgTAP verde: checkout, idempotencia, reservas y concurrencia, pagos, transiciones, cupones, RLS por rol |
| G3 Contrato FE↔BD | Cada PR | `supabase gen types` + typecheck de servicios del frontend; grep de RPC usadas frente a RPC existentes |
| G4 Sin drift | Antes de cada despliegue a QA | `supabase db diff --linked` vacío |
| G5 ETL / bridge | Antes del corte | Conteos y sumas cuadran; usuarios de prueba inician sesión |
| G6 Aprobación humana | Antes de Production | Informe de evidencias firmado |

---

## 8. Riesgos de la estrategia

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| El esquema real de Production difiere más de lo inferido | Alta | Alto | Diagnóstico 5.0 obligatorio antes de elegir ruta |
| Migración de `auth.users` (hashes, identidades Google) | Media | Alto | Ensayo con cuentas de prueba; si no es viable, cambiar Production a la ruta B-bridge (los usuarios permanecen en el proyecto actual) |
| Pagos aprobados durante el corte | Baja | Alto | Mantenimiento + cierre del checkout antes del ETL final; conciliación con Wompi después |
| Datos históricos inconsistentes (precios de cliente) | Alta | Medio | Copiar sin "corregir" y marcar con bandera; no recalcular historia |
| `pg_cron` no disponible o no deseado | Baja | Medio | Expiración también ejecutable desde un cron de Vercel que llama a la RPC |
| Referencia de Wompi por intento (`JM-001234-2`) no aceptada | Baja | Medio | Validar en Sandbox en la primera tarea de pagos |
| Agentes con acceso accidental a Production | Baja | Crítico | Política de secretos (M26) verificada antes de M24B |
