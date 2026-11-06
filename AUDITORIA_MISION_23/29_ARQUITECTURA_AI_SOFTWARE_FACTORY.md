# 29 — ARQUITECTURA DE LA AI SOFTWARE FACTORY · J&M FASHION STORE

**Estado:** propuesta de diseño (no implementada; la misión prohíbe iniciar la implementación).
**Objetivo:** que agentes de IA puedan desarrollar, probar, revisar y entregar J&M **de forma autónoma dentro de entornos autorizados**, sin pedir aprobación por cada tarea de programación, y **sin capacidad técnica de tocar Production**.

---

## 1. Principios de diseño

1. **Aislamiento por credenciales, no por promesas.** Los agentes nunca reciben claves de Production (Supabase service role prod, Wompi prod, token de Vercel con permiso de *production deploy*). Si no tienen la llave, no pueden romper Production.
2. **Todo cambio es un Pull Request.** Nadie (humano o agente) hace *push* a `main`. `main` protegida con checks obligatorios.
3. **Evidencia o no existe.** Una tarea solo se cierra con artefactos verificables (logs de CI, reportes de pruebas, capturas, trazas de Playwright, IDs de transacciones sandbox).
4. **Quien implementa no aprueba.** Revisión cruzada por un agente distinto (y con instrucciones distintas) antes del merge.
5. **Reproducibilidad primero.** BD local reconstruible desde migraciones en cada sandbox y en CI (hoy imposible: es la primera misión).
6. **Autonomía acotada por presupuesto.** Límite de iteraciones, tiempo y costo por tarea; escalado a humano al agotarse.

## 2. Arquitectura técnica

```
                         ┌──────────────────────────────────────────┐
                         │      HUMANO (Product Owner / Aprobador)  │
                         │  - Define misiones y prioridades         │
                         │  - Aprueba release a Production          │
                         └───────────────┬──────────────────────────┘
                                         │ misiones / aprobaciones
┌────────────────────────────────────────▼─────────────────────────────────────────┐
│ CAPA DE ORQUESTACIÓN                                                             │
│  Orquestador (agente planificador) + Cola de tareas (GitHub Issues/Projects)     │
│  - Descompone misiones en tareas con criterios de aceptación                     │
│  - Asigna a agentes especialistas, controla dependencias y presupuestos          │
│  - Estado: Backlog → Ready → In progress → In review → QA → Done / Blocked       │
└──────┬───────────────┬────────────────┬───────────────┬─────────────────┬────────┘
       │               │                │               │                 │
┌──────▼─────┐  ┌──────▼──────┐  ┌──────▼──────┐  ┌─────▼──────┐   ┌──────▼──────┐
│ Agente DB  │  │ Agente      │  │ Agente      │  │ Agente     │   │ Agente      │
│ (SQL/RLS)  │  │ Backend/API │  │ Frontend    │  │ Pagos      │   │ QA/E2E      │
└──────┬─────┘  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘   └──────┬──────┘
       │   cada agente trabaja en su SANDBOX efímero (rama + contenedor)   │
┌──────▼───────────────────────────────────────────────────────────────────▼───────┐
│ CAPA DE EJECUCIÓN AISLADA                                                        │
│  Sandbox por tarea: contenedor + git worktree + Supabase local (Docker)          │
│  + Node/pnpm + Deno + Playwright/Chromium + secretos SOLO de sandbox/QA          │
└──────┬───────────────────────────────────────────────────────────────────────────┘
       │ PR
┌──────▼───────────────────────────────────────────────────────────────────────────┐
│ CAPA DE VERIFICACIÓN                                                             │
│  GitHub Actions: lint · typecheck · unit · db reset + pgTAP · build · E2E        │
│  Agente Revisor (revisión cruzada) · Agente Seguridad-básica (secretos, RLS diff)│
│  Vercel Preview (por PR) ↔ Supabase QA (rama/proyecto QA) ↔ Wompi Sandbox        │
└──────┬───────────────────────────────────────────────────────────────────────────┘
       │ merge a main (automático si todo verde + revisor aprueba)
┌──────▼───────────────────────────────────────────────────────────────────────────┐
│ CAPA DE ENTREGA                                                                  │
│  main → despliegue automático a entorno QA/Staging                               │
│  Release candidate + Informe de evidencias → APROBACIÓN HUMANA → Production       │
│  (el pipeline de Production usa credenciales que ningún agente posee)            │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## 3. Entornos

| Entorno | Quién accede | Datos | Credenciales en agentes |
|---|---|---|---|
| **Sandbox local** (por tarea) | Agentes | Seeds deterministas, Supabase en Docker | Claves locales generadas por `supabase start` |
| **QA / Staging** | Agentes (lectura/escritura), humanos | Datos de prueba, Wompi **Sandbox** | `SUPABASE_QA_*`, `WOMPI_SANDBOX_*`, token Vercel limitado a *preview* |
| **Production** | Solo pipeline de release con aprobación humana | Reales | **Ninguna** |

Controles técnicos: (a) secretos de Production solo en el *environment* "production" de GitHub con *required reviewers* humanos; (b) token de Vercel de agentes sin permiso de *production*; (c) lista de hosts permitidos en sandboxes que excluya el host del proyecto Supabase de Production; (d) Wompi prod nunca configurado en QA.

## 4. Agentes especializados y responsabilidades

| Agente | Responsabilidad | Entradas | Salidas | Herramientas |
|---|---|---|---|---|
| **Orquestador** | Planificar misiones, crear tareas con criterios de aceptación, asignar, vigilar dependencias, presupuestos y bloqueos | Misión humana, docs 23–30, estado del tablero | Issues, plan, informe de avance | GitHub API (issues/projects), lectura de repo |
| **Arquitecto/Spec** | Convertir tareas en especificaciones técnicas (contratos RPC, esquemas, ADRs) | Tarea | ADR/Spec en `docs/specs/` vía PR | Repo, diagramas |
| **Agente DB** | Migraciones, funciones PL/pgSQL, RLS, seeds, pgTAP | Spec | PR con migración + pruebas pgTAP verdes | Supabase CLI, psql, pgTAP, Docker |
| **Agente Backend/API** | Vercel/Edge Functions, webhooks, integraciones servidor | Spec | PR + pruebas de integración | Node, Deno, Supabase local |
| **Agente Pagos** | Wompi (firma, widget, webhook, reembolsos), reconciliación | Spec | PR + evidencias Sandbox (IDs) | Wompi Sandbox API, ngrok/túnel a preview |
| **Agente Frontend** | Componentes, páginas, estado, responsive, accesibilidad | Spec + diseño | PR + pruebas unitarias + capturas | Vite, Vitest, Testing Library, Playwright |
| **Agente QA/E2E** | Escribir y mantener suites E2E; ejecutar regresión en Preview+QA | Criterios de aceptación | Reporte HTML Playwright, trazas, capturas | Playwright, axe-core, Lighthouse CI |
| **Agente Revisor** | Revisión cruzada de cada PR (correctitud, alcance, pruebas, mocks, seguridad básica) | Diff + spec + evidencias | Aprobación o cambios solicitados | GitHub PR review, lectura de repo, ejecución de pruebas |
| **Agente Seguridad-básica** | Escaneo de secretos, diff de políticas RLS, dependencias vulnerables (auditoría avanzada aplazada) | PR | Comentario con hallazgos bloqueantes | gitleaks, `pnpm audit`, consultas a `pg_policies` |
| **Agente Release/Docs** | Notas de versión, changelog, informe de evidencias, actualización de docs | Merges | Release candidate + informe | GitHub Releases, Markdown |

Regla: un agente **no** puede aprobar su propio PR; el Revisor usa un prompt/modelo/instrucciones diferentes y recibe el código, no la conclusión del implementador.

## 5. Sistema de orquestación

- **Fuente de verdad de tareas:** GitHub Issues + Projects (visible para humanos, auditable, integrado con PRs). Cada issue usa una plantilla: contexto, archivos, criterios de aceptación verificables, pruebas requeridas, dependencias, presupuesto.
- **Motor de orquestación:** un proceso orquestador basado en Claude Agent SDK (o sesiones de Claude Code en la nube) que:
  1. lee el tablero, toma tareas `Ready` cuyas dependencias estén `Done`;
  2. crea un sandbox y lanza el agente especialista con el brief de la tarea;
  3. vigila presupuesto (tokens/tiempo/iteraciones) y reintentos;
  4. al abrir PR, solicita revisión al Agente Revisor y espera CI;
  5. si CI o revisión fallan, devuelve la tarea al implementador (máx. N ciclos) o la marca `Blocked` con diagnóstico para un humano.
- **Paralelismo:** tareas independientes en paralelo (p. ej. Frontend de catálogo y DB de cupones); tareas que tocan migraciones se serializan (una migración a la vez para evitar conflictos de timestamps).

## 6. Entornos aislados de desarrollo y pruebas

Imagen de contenedor única ("j-m-factory") con: Node 22 + pnpm 11, Deno 2, Supabase CLI, Docker-in-Docker (o servicio Postgres+GoTrue), Playwright + Chromium, pgTAP, gitleaks. Arranque estándar en cada sandbox:

```
pnpm install --frozen-lockfile
supabase start            # BD local
supabase db reset         # aplica migraciones + seed.sql
pnpm --filter @jm/web dev # o build + preview
```

Cada tarea = rama `agent/<issue>-<slug>` + *worktree* propio; se destruye al cerrar.

## 7. Sistema de ejecución de tareas

Ciclo por tarea (Definition of Done incluida):
1. **Entender**: leer spec, docs 24–28 relevantes, código afectado.
2. **Probar primero**: escribir/ajustar la prueba que demuestre el defecto o el requisito (debe fallar).
3. **Implementar** en sandbox.
4. **Verificar local**: lint, typecheck, unit, `db reset` + pgTAP, build, E2E afectados.
5. **Abrir PR** con: descripción, criterios cumplidos, comandos ejecutados y salidas, capturas.
6. **CI** en GitHub Actions (mismos pasos, ambiente limpio) + **Vercel Preview** + E2E contra Preview conectado a QA.
7. **Revisión cruzada**.
8. **Merge automático** si todo verde y aprobado; despliegue automático a QA.
9. **Cierre** con enlace a evidencias.

## 8. Sistema de revisión cruzada

- Revisor independiente obligatorio + checklist: ¿cumple criterios?, ¿pruebas reales (no tautológicas)?, ¿introduce mocks/fallbacks en producción?, ¿migración reversible y que reconstruye desde cero?, ¿RLS revisada por rol?, ¿documentación actualizada?
- Para cambios de **DB/RLS/pagos**: dos revisores (Revisor + Seguridad-básica).
- Desacuerdo persistente (2 ciclos) ⇒ escalado humano.
- Muestreo humano periódico (p. ej. 1 de cada 10 PRs) para calibrar al revisor.

## 9. Automatización de pruebas con navegador

- Playwright con proyectos `desktop-chrome`, `mobile-iphone`, `mobile-android`.
- Suites: `smoke` (cada PR), `compra` (catálogo→pago Sandbox→confirmación), `admin`, `visual` (capturas por breakpoint), `a11y` (axe).
- Pago: Wompi Sandbox con tarjetas/escenarios de prueba oficiales; el webhook de Sandbox apunta a la URL del entorno QA. Para PRs, se valida la firma y la creación del pedido en Preview, y la confirmación de webhook se prueba con eventos firmados reproducidos contra la BD local.
- Artefactos: reporte HTML, trazas (`--trace on` solo al fallar), video en fallos, capturas a `deviceScaleFactor: 2` para informes.

## 10. Sistema de evidencias y reportes

- Por PR: comentario automático con tabla de checks, enlaces a reporte Playwright, capturas, salida de pgTAP, tamaño de bundle.
- Por misión: `docs/evidencias/<mision>/INFORME.md` generado por el Agente Release/Docs: tareas cerradas, PRs, cobertura de criterios, riesgos abiertos.
- Tablero de estado (artefacto/dashboard) con: % de módulos por estado (mismas categorías de esta auditoría), CI verde/rojo, deuda abierta.
- Retención de artefactos ≥ 30 días en GitHub Actions.

## 11. Mecanismo de entrega del software terminado

1. `main` siempre desplegable a QA (automático).
2. **Release candidate** etiquetado (`vX.Y.Z-rc`) cuando la misión cumple criterios; informe de evidencias adjunto.
3. **Aprobación humana** explícita en el *environment* "production" de GitHub.
4. Pipeline de release (sin agentes): migraciones a Production con respaldo previo, despliegue Vercel production, smoke tests no transaccionales (sin compras reales), monitoreo.
5. Plan de *rollback* documentado (revert de despliegue Vercel; migraciones con plan de reversión).

## 12. Herramientas necesarias (resumen)

| Categoría | Herramienta |
|---|---|
| Modelos/agentes | Claude (Agent SDK / Claude Code en la nube) |
| Código y tareas | GitHub (repo, Issues, Projects, PRs, Actions, Environments, branch protection) |
| BD | Supabase CLI + Docker, proyecto Supabase QA, pgTAP |
| Hosting | Vercel (Preview + Production separado) |
| Pagos | Wompi Sandbox (llaves de prueba) |
| Pruebas | Vitest, Testing Library, Playwright, axe-core, Lighthouse CI |
| Calidad | ESLint 9 (flat config), Prettier, TypeScript (migración gradual), gitleaks |
| Observabilidad (QA) | Logs de Vercel/Supabase, Sentry (opcional) |

## 13. Prerrequisitos antes de encender la fábrica (bloqueantes)
1. BD reconstruible desde cero (squash de migraciones) — doc 30, Misión 24.
2. Proyecto Supabase QA + Wompi Sandbox + Vercel Preview configurados por un humano.
3. CI mínima en GitHub y `main` protegida.
4. Política de secretos: los agentes solo reciben credenciales de sandbox/QA.
5. Documentos "GO-LIVE APPROVED" antiguos marcados como no confiables.
