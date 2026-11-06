# M30.1 — Cierre de respaldo, recuperación y versionado; puntos de autorización del reset de QA

> **M30.2:** las herramientas operativas citadas aquí (`inventory.mjs`, `compare_inventory.mjs`, `backup_logical_api.mjs`, `backup_qa_owner.sh`, `restore_dump_local.sh`) no se versionan en el repositorio (regla 6 de `20_migrations_policy`: ningún ejecutable versionado puede contener operaciones remotas de Supabase). Se entregan aparte como kit `jm-qa-tools` con sus huellas SHA-256; ver `MISION_30_2/00_DECISION_Y_VERSIONADO.md`.

**Proyecto:** QA `yomgxdjgfjnrjaqiarvw` (`jm-fashion-qa`). **Production (`pgvffddxwvwmerqvzjth`): sin acceso.**
**Hecho en M30.1:** solo lecturas de QA (endpoint de consultas de solo lectura, con el proyecto validado antes de cada
ejecución) y trabajo local. Ninguna escritura en QA, ningún reset ni migración remota, ningún cambio en Auth, Storage,
Edge Functions, secretos ni Vercel, ningún commit, push, PR, merge ni deploy. El POS no se ha tocado.

---

## 1. Backup autoritativo

### 1.1 Revisión de los scripts (cambios de M30.1)
| Script | Hallazgo de la revisión | Cambio |
|---|---|---|
| `backup_qa_owner.sh` | No se podía probar sin QA | **Modo ensayo local** (`JM_REHEARSAL_WORKDIR`): mismos comandos contra un stack local; los pasos solo de la nube se registran `OMITIDO` |
| | El proyecto no se validaba por API antes de operar | Validación previa: la API debe devolver exactamente `yomgxdjgfjnrjaqiarvw`; si no, aborta |
| | El token iba en la línea de órdenes de `curl` (visible en la lista de procesos) | El token se pasa por stdin (`curl -H @-`) |
| | No se comprobaba que no se filtrasen credenciales | Falla si el valor del token o de la contraseña de la BD aparece en cualquier archivo o log, o si hay llaves con forma conocida en `config/` o `logs/` |
| | Los nombres de secretos se extraían de una tabla de texto | Se leen por API y se guardan **solo** nombres que cumplen `[A-Z0-9_]+` |
| | Faltaba la identificación de la cuenta administradora | `config/admin_accounts.txt`: id, correo enmascarado, rol, confirmado (desde los volcados) |
| | No comprobaba archivos de Storage frente a objetos registrados | Cuenta por bucket: archivos descargados = objetos en `storage.objects` |
| | `column` no existe en todos los sistemas | Salida sin dependencias |
| | Salidas del CLI mezcladas con la consola | Cada orden escribe su log en `logs/`; resultado global en `RESULTADO.txt` |
| `restore_dump_local.sh` | Verificaba la integridad después de comprobar la BD | La integridad (SHA-256 de cada archivo del manifiesto y `RESULTADO.txt = OK`) es lo **primero**; una copia alterada se rechaza sin tocar nada |
| | No restauraba los archivos de Storage | Paso 5 (`RESTORE_WORKDIR`): sube los archivos al stack local y los vuelve a descargar comparando SHA-256 archivo por archivo |
| | — | Storage prohíbe borrar en sus tablas por SQL (trigger `storage.protect_delete`); la restauración no borra: la subida actualiza los metadatos |

### 1.2 Ensayo de extremo a extremo (en local, con forma de QA) — **PASS**
1. Réplica de QA restaurada en un stack local aislado (PostgreSQL 17.11) desde la copia lógica de M30: 28/28 migraciones, 27/27 tablas idénticas a QA.
2. Una imagen real subida al bucket `editorial_images` de la réplica.
3. `backup_qa_owner.sh` en modo ensayo → **COPIA: OK**: 5 volcados, 1 archivo de Storage (1 archivo = 1 objeto), cuenta administradora identificada, manifiesto SHA-256, ningún secreto en archivos ni logs.
4. Stack nuevo y vacío → `restore_dump_local.sh` → **RESTAURACIÓN: PASS**:

| Verificación | Resultado |
|---|---|
| Integridad (SHA-256 de cada archivo del manifiesto) | OK |
| Tablas de `public` | 27 |
| Usuarios de `auth` / objetos de Storage / versiones del historial | 1 / 1 / 28 |
| Sumas de control frente a la copia lógica **independiente** (`md5` de las filas, `COLLATE "C"`) | **27/27 idénticas** |
| Archivos de Storage subidos y descargados de nuevo | **SHA-256 idéntico** |
| Prueba negativa: copia con 1 byte alterado | Rechazada antes de tocar la BD (`copia alterada`, código 3) |

### 1.3 Instrucciones exactas para Windows
**Entorno:** WSL2 con Ubuntu + Docker Desktop (el CLI ejecuta `pg_dump` en un contenedor y la restauración local levanta un
stack de Supabase). Git Bash no sirve: falta Docker integrado y `psql`.

PowerShell **como administrador** (una vez):

    wsl --install -d Ubuntu-24.04

Reiniciar. Instalar Docker Desktop → Settings → Resources → WSL integration → activar `Ubuntu-24.04`.

En la terminal de **Ubuntu (WSL)**:

    sudo apt update && sudo apt install -y postgresql-client python3 curl git ca-certificates
    mkdir -p ~/.local/bin && curl -fsSL https://github.com/supabase/cli/releases/download/v3.0.0/supabase_linux_amd64.tar.gz | tar -xz -C ~/.local/bin supabase
    export PATH="$HOME/.local/bin:$PATH"
    supabase --version          # debe mostrar 3.0.0
    docker info >/dev/null && echo "docker OK"

Código: clonar **dentro de WSL** (no en `/mnt/c`, para evitar finales de línea CRLF en los `.sh`). Los scripts de M30/M30.1 **aún no están
en ningún commit**: requieren la autorización de versionado (§3) y su publicación, o recibirlos como archivos.

    git clone https://github.com/unjuandice3333-star/j-m.git ~/j-m && cd ~/j-m && git checkout <rama autorizada>

Credenciales (solo en la terminal; `read -s` no las muestra ni las guarda en el historial):

    read -rs -p "Token de Supabase: " SUPABASE_ACCESS_TOKEN && export SUPABASE_ACCESS_TOKEN && echo
    read -rs -p "Contraseña de la BD de QA: " SUPABASE_DB_PASSWORD && export SUPABASE_DB_PASSWORD && echo

(Si el CLI vuelve a pedir la contraseña, se escribe en el aviso; el binario 3.0.0 hace referencia a `SUPABASE_DB_PASSWORD`, pero su lectura desde el entorno no se ha podido verificar sin QA.)

Token recomendado: **token con permisos acotados** de solo lectura (`projects_read`, `database_pooling_config_read`,
`api_gateway_keys_read` + `api_gateway_keys_secret_read` para Storage, `edge_functions_read`, `edge_functions_secrets_read`)
en lugar del token personal completo. Sin contraseña de BD, `db dump`/`migration list` pueden requerir `database_write`
(el CLI crea un acceso temporal): por eso se recomienda dar la contraseña.

Copia (FUERA del repositorio):

    bash jm-qa-tools/backup_qa_owner.sh ~/jm-privado/qa-backup
    # responde "s" tras comprobar que la API devolvió yomgxdjgfjnrjaqiarvw; termina con "COPIA: OK"

Restauración obligatoria en un stack local vacío con PostgreSQL 17:

    supabase stop --all 2>/dev/null; mkdir -p ~/jm-restore && cd ~/jm-restore && supabase init
    sed -i 's/^major_version = .*/major_version = 17/' supabase/config.toml
    sed -i '/^\[db.seed\]/,/^\[/ s/^enabled = .*/enabled = false/' supabase/config.toml
    supabase start -x studio,realtime,edge-runtime,logflare,vector,imgproxy,mailpit,postgres-meta,supavisor
    cd ~/j-m && RESTORE_WORKDIR=~/jm-restore bash jm-qa-tools/restore_dump_local.sh ~/jm-privado/qa-backup/qa_<fecha>
    # termina con "RESTAURACIÓN: PASS"; después: cd ~/jm-restore && supabase stop --no-backup

Contraste opcional con una segunda copia independiente (requiere Node 22): `node jm-qa-tools/backup_logical_api.mjs --out ~/jm-privado/qa-logica`
y pasar ese directorio como segundo argumento de `restore_dump_local.sh` (27/27 sumas idénticas).

Custodia: la copia contiene hashes de contraseñas y datos de prueba de clientes. Cifrarla y guardar su huella:

    cd ~/jm-privado/qa-backup && tar -czf - qa_<fecha> | gpg --symmetric --cipher-algo AES256 -o qa_<fecha>.tar.gz.gpg
    sha256sum qa_<fecha>.tar.gz.gpg > qa_<fecha>.tar.gz.gpg.sha256

### 1.4 Criterio de copia completa
Solo cuando **todo** esto se cumple: `COPIA: OK` y `RESULTADO.txt` con `resultado=OK`; `MANIFEST.tsv` con SHA-256, tamaño,
fecha y `OK` en cada archivo (los `OMITIDO` solo en modo ensayo); `restore_dump_local.sh` → `RESTAURACIÓN: PASS` con los
archivos de Storage verificados; y la copia cifrada guardada fuera de WSL (disco externo o almacenamiento del propietario).

---

## 2. Revisión de recuperación
| Elemento | ¿En la copia? | Recuperación | Probado |
|---|---|---|---|
| Esquema `public` (27 tablas, funciones, políticas, enums POS heredados) | Sí (`schema.sql`) | Automática | Sí (local, PASS) |
| Datos de `public` | Sí (`data_public.sql`) | Automática | Sí, 27/27 sumas |
| Usuarios de `auth` (1 cuenta, 1 identidad, 74 sesiones; hashes de contraseña) | Sí (`data_auth_storage_history.sql`) | Automática | Sí (1 usuario restaurado; el inicio de sesión con la contraseña antigua no se ha probado) |
| Historial de migraciones (28 versiones con su SQL) | Sí | Automática | Sí (28) |
| Metadatos de Storage (buckets, objetos) | Sí | Automática | Sí |
| Archivos de Storage (1 imagen, 2,9 MB) | Sí (`storage/`) | `storage cp -r` | Sí (con un archivo de ensayo; el real se verificará con la copia del propietario) |
| Configuración de roles (`statement_timeout`) | Sí (`roles.sql`, sin contraseñas) | Automática | Sí |
| Código desplegado de `wompi-webhook` (v3) | Sí (`functions/`) | `supabase functions deploy` del código descargado | **No** (solo en la nube) |
| Configuración de Auth (Site URL, redirecciones, correo, JWT…) | Sí, **sin** secretos | **Manual** en el panel | No |
| Valores de secretos (`WOMPI_EVENTS_SECRET`) | **No** (solo nombres) | **Manual**: el propietario los conserva en su gestor / panel de Wompi | — |
| Contraseña SMTP, secretos OAuth | No (no hay configurados en QA) | — | — |
| `vault.secrets`, `cron`, `net`, suscripciones de `realtime` | No aplican (0 / inexistentes en QA, comprobado) | — | — |
| Event trigger `ensure_rls` (activación automática de RLS del panel) | En `schema.sql` (DDL) | Automática o desde el panel | No |
| Ajustes del proyecto (claves API, JWT secret, red, plan) | No (los conserva la plataforma; el reset no los toca) | — | — |
| Logs y analítica | No | No recuperables | — |

**Pasos si el reset falla** (operaciones remotas; requieren autorización en ese momento):
1. **Preferente — reintentar el reset**: el estado objetivo es M24; si el reset termina a medias, volver a ejecutarlo es idempotente.
   Verificar con `inventory.mjs` + `compare_inventory.mjs`.
2. **Volver al estado anterior** (solo si se decide): restaurar la copia con la secuencia **probada en local**
   (roles → esquema → auth/storage/historial → public → archivos de Storage) contra QA vacío. Vaciar `public` antes requiere
   un reset sin migraciones (`--no-seed`, directorio de migraciones vacío): **ese paso no se ha ensayado**, ni la restauración
   sobre QA. Redesplegar la función v3 descargada y volver a fijar `WOMPI_EVENTS_SECRET`.
3. **No se declara recuperación completa del QA remoto**: la restauración está probada en local, no contra QA.

---

## 3. Versionado

### 3.1 Inventario
78 entradas en `git status` = **749 archivos** frente a `e42ecae`. Los archivos versionados no cambiaron desde la CI de cierre de
M28 (`ci-artifacts/worktree_diff.patch` es idéntico byte a byte al diff actual); M29, M30 y M30.1 solo añadieron archivos o
modificaron scripts de `scripts/qa/`. `scripts/qa/rehearse_reset_local.sh` ya estaba versionado (M26) y no ha cambiado.

### 3.2 Estrategia: seis commits en orden, cada uno con su estado completo y validado
| # | Commit | Archivos | Fuente de la frontera |
|---|---|---|---|
| 1 | M26-R1.1 Preview/Production | 26 (7 nuevos, 19 mod.) | Parche de respaldo tomado antes de M27 (`r1_1_pendiente.patch`): exacto |
| 2 | M27 ecommerce real E2E | 54 (18 nuevos, 36 mod.) | **Reconstruido**: estado de M28 menos las ediciones de M28, deshechas por texto exacto |
| 3 | M28 persistencia, wishlist, variante, sesiones, Wompi/QA prep. | 24 (9 nuevos, 15 mod.) | Estado al cierre de M28 = CI 18/18 |
| 4 | M29 inventario de QA | 4 nuevos | Exacto |
| 5 | M30 backup, PG 17, plan de reconstrucción | 12 (10 nuevos, 2 mod.) | Exacto (se deshizo la ampliación de índices/triggers para la frontera M29/M30) |
| 6 | M30.1 cierre | `backup_qa_owner.sh`, `restore_dump_local.sh`, `MISION_30_1/` | Exacto |

**Validación de la estrategia (sin commits):** en un worktree temporal desacoplado de `e42ecae` se cargó cada etapa, se
generó su árbol con `git write-tree` (objetos sin referencias) y su parche, y se validó:

| Etapa | lint | typecheck | unit | webhook | Edge 10/10 + 30/30 | entorno 141/141 | build |
|---|---|---|---|---|---|---|---|
| R1.1 | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| M27 | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| M28 | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| M29 | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| M30 | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

El árbol de la etapa M30 es **idéntico** (`e8e28e5…`) al estado del directorio antes de M30.1; M30.1 añade solo los dos
scripts revisados y este documento. Parches por etapa: `split/patches/0{1..5}_*.patch` (área temporal de la sesión).

Defectos encontrados al validar la reconstrucción de M27 y corregidos antes de dar la estrategia por buena: un marcador de
corte ambiguo en `PublicLayout.jsx`, dos pruebas de R1.1 copiadas de un estado posterior y `AdminEditorialImagesPage.jsx`
(reescritura de M28) que debía quedar con la versión original en la etapa M27. Todos los detectó la validación por etapa.

### 3.3 Archivos compartidos entre misiones (19) y decisión
| Archivo | Misiones | Tratamiento |
|---|---|---|
| `eCommerceStore.js`, `PublicLayout.jsx`, `HomePage.jsx`, `CartPage.jsx`, `CheckoutPage.jsx`, `AccountPage.jsx`, `WishlistPage.jsx`, `ProductCard.jsx`, `e2e/README.md` | M27 + M28 | Versión M27 reconstruida (sin las ediciones de M28) en el commit 2; el commit 3 aporta solo el diff de M28 |
| `e2e/e2e_quality.cjs` | M27 (+ arreglo de lint de M28) | El arreglo de una línea se incluye en el **commit de M27** para que ese commit pase la CI (el archivo se copió después de la última CI de M27) |
| `test-edge-config.ts`, `r1_1_deploy_context.test.mjs`, `allowlist.generated.json` (×2) | R1.1 + M28 | Versión R1.1 (QA vacía) en el commit 1; el host de QA y las pruebas ajustadas en el commit 3 |
| `test-edge-security.ts`, `test-webhook-security.mjs`, `vite.config.js`, `deploy_build.test.mjs` | R1.1 + M27 | R1.1 exacta en el commit 1; reescrituras de M27 en el commit 2 |
| `jm-qa-tools/inventory.mjs`, `compare_inventory.mjs` | M29 + M30 | Sin índices/triggers en el commit 4; ampliación en el commit 5 |

Riesgos del versionado:
- La frontera M27/M28 es una **reconstrucción validada**, no una instantánea histórica.
- R1.1 arrastra hallazgos abiertos de la auditoría R1.2 (H1, H2, H5), que deben quedar anotados en su commit o corregirse antes.
- Los mensajes deben seguir `scripts/ci/check_commits.sh`; hay que ejecutar Gitleaks antes de cada commit.
- `apps/web/.env.local` está ignorado por git y no entra en ningún commit.

---

## 4. Procedimiento de reset: `supabase db reset --remote=yomgxdjgfjnrjaqiarvw`
| Pregunta | Respuesta |
|---|---|
| Versión del CLI | **3.0.0** (la única probada; `backup_qa_owner.sh` avisa si es otra). Instalar exactamente esa versión |
| Semántica (ayuda del CLI) | «Resets a database to current migrations»: vacía los esquemas de usuario, aplica `supabase/migrations/` del directorio actual y, salvo `--no-seed`, los seeds de `[db.seed]` |
| Proyecto | La referencia explícita `yomgxdjgfjnrjaqiarvw`; el CLI imprime `Target:` antes de actuar. Nunca `--linked` ni `link` |
| Confirmación | Es un cambio alojado: el CLI exige confirmación interactiva o `--yes` / `SUPABASE_YES` exportado en la shell (nunca desde `.env`). Se ejecuta **sin** `--yes` para confirmar a mano |
| Credenciales y permisos | Token (permisos acotados: `database_write`, `database_pooling_config_read`, `projects_read`) y contraseña de la BD |
| Directorio | Raíz del repositorio en el commit autorizado: `supabase/migrations/` = solo `20261106120000_baseline_ecommerce.sql` (SHA-256 `df81f30395ec9cb8e60fbe1eb0073d843c7da56b0dfaa076a61d906916638990`) |

**Qué hace (observado en el ensayo M30 sobre la réplica de QA, CLI 3.0.0, PG 17):**

| Área | Efecto |
|---|---|
| `public` heredado (tablas, funciones, políticas, enums POS) | **Eliminado**; M24 aplicado; catálogo idéntico a la línea base |
| Historial `supabase_migrations` | **Sustituido**: solo `20261106120000` (sin `migration repair`) |
| `auth` (usuarios, identidades, sesiones) | **Vaciado**; quedan las 4 cuentas seed (sin contraseña utilizable). **La cuenta del propietario desaparece** |
| Storage | **Se conserva** (buckets, objetos y archivos: Storage protege sus tablas con `storage.protect_delete`); M24 añade `product-images` y `site-content` |
| Edge Functions y secretos | **No los toca** (no son parte de la base de datos): la v3 sigue activa hasta redesplegar |
| Configuración de Auth, claves API, JWT, red | No cambian (son del proyecto, no de la base) |
| Event trigger `ensure_rls` / `rls_auto_enable()` | En el ensayo no existía (la deriva no está en el historial); en QA hay que comprobar tras el reset si se mantiene. Es inocuo para M24 (activa RLS, que M24 ya activa) |

**Diferencias entre el ensayo y la ejecución remota:**

| | Ensayo (M30) | QA |
|---|---|---|
| Destino | URL de la réplica local (`--remote=postgresql://…`) | Referencia (`--remote=yomgxdjgfjnrjaqiarvw`), conexión resuelta por la plataforma (pooler) |
| Contenido | Historial de QA reproducido + datos idénticos | Estado real de QA, **con la deriva** (`ensure_rls`, RLS manual, política eliminada) |
| Storage | Bucket sin archivos (en M30) | 1 archivo real |
| Confirmación | `--yes` (destino local del agente) | Confirmación manual del propietario |
| Versión de PostgreSQL | 17.11 (imagen 17.11.0.011) | 17.11 (17.11.0.003) |

**Riesgo residual:** la ruta «referencia» no se ha ejecutado nunca contra un proyecto alojado. Se mitiga con la copia
verificada, la verificación posterior completa y el reintento idempotente.

---

## 5. Criterios de aprobación

### 5.1 Antes del reset (todos obligatorios)
| # | Verificación | Evidencia |
|---|---|---|
| A1 | Backup completo: `COPIA: OK`, manifiesto con SHA-256 y tamaño, ningún secreto en archivos ni logs | `MANIFEST.tsv`, `RESULTADO.txt` |
| A2 | Backup restaurado y verificado en local: `RESTAURACIÓN: PASS`, incluidos los archivos de Storage | Salida de `restore_dump_local.sh` |
| A3 | Copia cifrada y guardada fuera de WSL, con su huella SHA-256 | `.gpg` + `.sha256` |
| A4 | Código versionado y disponible: los 6 commits creados (con Gitleaks y CI) y publicados en la rama autorizada | SHA de cada commit, CI verde |
| A5 | El directorio desde el que se ejecutará el reset tiene solo M24 en `supabase/migrations/` y el SHA-256 de M24 coincide | `ls supabase/migrations`, `sha256sum` |
| A6 | Usuario administrador recreable: procedimiento de 04 §1.5 de M30 leído (contraseña de `admin@`/`superadmin@` o recreación de la cuenta propia + `admin_set_user_role`) | Confirmación del propietario |
| A7 | Variables QA identificadas: archivo QA (11 variables) preparado fuera del repositorio y `pnpm check:qa` = VÁLIDO; secreto sandbox de eventos disponible | Salida de `check:qa` |
| A8 | Webhook antiguo desconectado: URL de eventos de Wompi Sandbox vacía o apuntando a ningún destino | Captura del panel |
| A9 | Procedimiento de recuperación revisado (§2), incluyendo que la vuelta atrás remota no está ensayada | Firma del propietario |
| A10 | Proyecto validado justo antes: `backup_qa_owner.sh` (o `inventory.mjs`) muestra `yomgxdjgfjnrjaqiarvw` y el `Target:` del CLI coincide | Salida en pantalla |
| A11 | Decisión escrita y fechada del propietario en `FACTORY/EXECUTION_LOG.md` citando A1–A10 | Entrada del registro |

### 5.2 Después del reset
| # | Verificación | Criterio |
|---|---|---|
| D1 | `compare_inventory.mjs` frente a la línea base M24 en PG 17 | Esquema, RPC, índices, triggers, RLS, roles y Storage en PASS |
| D2 | `supabase migration list --remote=yomgxdjgfjnrjaqiarvw` | Solo `20261106120000` |
| D3 | `supabase test db --remote=… <todos menos 95_concurrency>` | 278/278 |
| D4 | Event triggers | Anotar si `ensure_rls` sigue; decidir mantenerlo o retirarlo |
| D5 | Storage | `product-images` y `site-content` públicos, 5 MB; `editorial_images` conservado (retirada opcional y autorizada) |
| D6 | Auth y usuarios | Contraseñas fijadas; admin y cliente inician sesión; cuenta del propietario recreada si se desea |
| D7 | Edge Function | Redesplegada, `verify_jwt=false`, `APP_ENV=qa`, firmas inválidas → 401 |
| D8 | Wompi | URL de eventos reconectada a la función nueva; evento de prueba aplicado |
| D9 | Recorridos | 12 recorridos de `MISION_30/05` en PASS |

---

## 6. Resumen de riesgos abiertos
| Riesgo | Estado |
|---|---|
| Los scripts del propietario dependen de que el código esté publicado | Pendiente de autorizar commits/publicación (o entrega de archivos) |
| Lectura de `SUPABASE_DB_PASSWORD` desde el entorno en CLI 3.0.0 | No verificada sin QA; si no se lee, el CLI pide la contraseña |
| Ruta remota del reset y vuelta atrás remota | No ensayadas contra un proyecto alojado |
| Inicio de sesión con contraseñas restauradas | No probado |
| Token personal guardado en el entorno «j-m (inventario QA)» de la sesión | Revocar cuando no se necesite |
| Worktrees temporales (`split/wt`, `wt2`, `wt3`) registrados en el repositorio local | Retirar con `git worktree remove <ruta>` cuando lo autorice (no contienen trabajo propio) |

## 7. Punto de control
**Preparación terminada. Nada remoto se ha modificado.** Se solicita autorización expresa, por separado, para:
1. Crear los seis commits (con Gitleaks y CI por commit) y publicar la rama.
2. Que el propietario ejecute el backup y la restauración local (A1–A3).
3. El reset de QA (tras A1–A11).
4. Las configuraciones posteriores (Auth, usuarios, secretos, Edge Function, Wompi) y la validación D1–D9.
