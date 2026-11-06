# PRESERVACIÓN DEL TRABAJO M24 — INFORME

**Fecha:** 2026-11-06 · **Rama:** `db/baseline-m24b` · **Ejecutado por:** orquestador (Claude Code, sesión en la nube)

## 1. Verificación del historial (en Git, no en resúmenes)
| Elemento | Resultado |
|---|---|
| Rama actual | `db/baseline-m24b` |
| M24B `9183090` | Existe: `91830903ac2539ea077be97e9676e24914b4a778` |
| M24C `67312b0` | Existe: `67312b099e57fc6e133cda83f8e7ccb33ce977d6` |
| M24D `465e294` | Existe: `465e2940dd933e9ba9ea6121e1d1b1e2ef79c392` |
| Árbol `supabase/` en M24D | `daefb1318501d4198d97a1a09c088fd3d2345308` (el mismo que se validó en M24D) |
| Orden | `9183090` → `67312b0` → `465e294`, todos ancestros de HEAD |
| Repositorio superficial | No: historial completo, 92 commits |

## 2. Hallazgos de preservación y correcciones
| # | Riesgo encontrado | Acción |
|---|---|---|
| P1 | `AUDITORIA_MISION_23/` (24 archivos) y `MISION_24A/` (14 archivos) existían **solo como archivos sin seguimiento** en el disco efímero | Versionados sin cambios en el commit de preservación `c09a4a3` |
| P2 | Los registros `.log` de evidencia de **M24B (3)** y **M24C (9)** **nunca se commitearon**: `.gitignore` raíz contiene `*.log`. En M24D ya se había corregido para sus propios registros | Incluidos con `git add -f` en `c09a4a3`. Se verificó que no contienen llaves |
| P3 | Los bundles anteriores (`m24b_backup.bundle` → `9183090`, `m24d_pre_backup.bundle` → `67312b0`) **no contienen M24D** | Se generó un bundle nuevo completo (§3) |

Tras la corrección: **0 archivos ignorados o sin seguimiento** fuera de `node_modules`.

## 3. Copias verificables (fuera del repositorio)
Se entregan como archivos adjuntos en la conversación, una ubicación persistente para el usuario, junto con sus sumas SHA-256.

| Archivo | Contenido | Verificación |
|---|---|---|
| `jm-fashion-store_db-baseline-m24b_<HEAD>.bundle` | Historial **completo** de `db/baseline-m24b` y `main` ("The bundle records a complete history") | `git bundle verify` OK. Restauración real en un clon vacío **sin red**: mismo HEAD, mismos commits de misión, `git fsck --full` sin errores, árbol de trabajo idéntico (`diff -r` vacío) |
| `BUNDLE.sha256` | SHA-256 del bundle | — |
| `jm_m24_documentos_y_evidencias_c09a4a3.tar.gz` | Exportación de `AUDITORIA_MISION_23`, `MISION_24A`, `MISION_24B`, `MISION_24C`, `MISION_24D` y `supabase` (180 archivos) | Extraído y comprobado con `sha256sum -c` contra `INVENTARIO_M24.sha256`: **180/180 coinciden** |
| `EXPORT.sha256` | SHA-256 del tar.gz: `443adf80710138cd53a43edfd89bb9b4e8b3ddb3e8e0784ade8cd84aa8e493e3` | — |
| `INVENTARIO_M24.sha256` (también en esta carpeta) | SHA-256 de cada uno de los 180 archivos | — |

| Carpeta | Archivos |
|---|---|
| AUDITORIA_MISION_23 | 24 |
| MISION_24A | 14 |
| MISION_24B | 12 |
| MISION_24C | 39 |
| MISION_24D | 54 |
| supabase | 37 |

**Nota:** el bundle se genera **después** del commit que incluye este informe, por lo que su SHA-256 no puede figurar aquí. Está en `BUNDLE.sha256`, que acompaña al bundle, y en el informe de cierre de la conversación.

## 4. Restricciones respetadas
Sin push, sin merge, sin operaciones remotas. No se eliminó ninguna carpeta ni archivo de misión.

Restauración: ver `RESTAURACION.md`.
