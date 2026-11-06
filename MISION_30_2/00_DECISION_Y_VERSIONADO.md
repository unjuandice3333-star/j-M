# M30.2 — Decisión: conservar la política de migraciones; herramientas operativas fuera del repositorio

## Decisión del propietario
La CI de los seis commits locales de M30.1 falló en `20_migrations_policy`, regla 6: ningún archivo ejecutable versionado
puede contener operaciones o destinos remotos de Supabase. El propietario eligió **no versionar** las herramientas
operativas de QA y **no debilitar** la regla: sin excepciones, sin exclusiones de directorios, sin cambios en workflows y sin
envoltorios que oculten órdenes remotas. Las pruebas de la política siguen activas.

## Herramientas retiradas del repositorio (kit externo `jm-qa-tools`)
| Archivo | SHA-256 (versión entregada) |
|---|---|
| `inventory.mjs` | `dba45390e219ed1033a700d6b8ab7d4a670817c81e5891329db3fed75d1645f6` |
| `compare_inventory.mjs` | `b77cf854906a4287f5c25c14f62f1232517e55617d221e4b465a78bbfd9c601f` |
| `backup_logical_api.mjs` | `b99adc00021f657ea56d44246cd25881198d64c9d22b724f5d460df789ee939f` |
| `backup_qa_owner.sh` | `68c205fadf84a76c6ef345a2050960cf5266d3398b57163df9f2a208de16e365` |
| `restore_dump_local.sh` | `f1f32653bba499abbed31af5f7af8ebb0243a9a2870ac3a79d8d74f32920d355` |
| `README.md` del kit | `a04d2c0e88d75643238887e8e130dea48ae28274d2321be3177c4fb787858fc9` |

- `compare_inventory.mjs` no ejecuta nada remoto, pero la política lo señala por el texto de un mensaje; no se reescribe
  para esquivar la regla: se entrega en el kit.
- Adaptaciones mínimas para funcionar fuera del repositorio, sin perder funcionalidad: destino comprobado con Git **antes**
  de crear nada (corrige un defecto: antes se creaba el directorio y luego se rechazaba), `--repo` en `compare_inventory.mjs`,
  rutas en comentarios y cabecera de herramienta externa.
- Verificación del kit: protecciones de destino y de Production; ciclo completo en ensayo local (réplica de QA, PG 17):
  **COPIA: OK** → **RESTAURACIÓN: PASS**, 27/27 sumas de control, archivo de Storage con SHA-256 idéntico.
- Sigue versionado (local, cumple la política): `scripts/qa/restore_test_local.py`.

## Documentación revisada
- Referencias `scripts/qa/<herramienta>` → `jm-qa-tools/<herramienta>`, con una nota M30.2 al inicio de cada documento afectado
  (`MISION_29/00`, `MISION_30/00–04`, `MISION_30_1/00`).
- Datos personales retirados de `MISION_30/01` y `/04` (correo enmascarado y fragmentos del identificador de la cuenta).
- Ruta interna del entorno de trabajo retirada de `MISION_28/00` (en este commit, porque el commit de M28 conserva su hash).
- Resultados técnicos y conclusiones sin cambios.

## Historial local
- Se conservan los tres primeros commits: `b4f1bca` (M26-R1.1), `322df51` (M27) y `53f6298` (M28).
- Se reconstruyen M29, M30 y M30.1 sin las herramientas operativas y con la documentación saneada; este séptimo commit
  recoge la corrección de `MISION_28` y este registro.
- Los commits anteriores (`1e851c8`, `6a9ed3e`, `c030742`) quedan conservados en un *bundle* verificado fuera del repositorio.
- Nada publicado: sin push, PR, merge ni despliegue.
