# M26 — Diagnóstico inicial y tarea T1

**Rama:** `mission/m26-dev-qa-environments` (local, sin publicar). Rebasada sobre `1eba099` (M25 validada en GitHub);
el commit del plan (`00_PLAN.md`) se conservó byte a byte. Respaldo de la versión anterior: `refs/backup/m26-4944d93` y un bundle con SHA-256.
**Estado de M26:** EN CURSO. Solo T1 está ejecutada; M26 no está terminada.

## 1. Diagnóstico del plan
| Aspecto | Situación |
|---|---|
| Qué existe | `00_PLAN.md`: 6 problemas verificados en el código, el diseño de lista de permitidos, las tareas T1–T8, 8 criterios de aceptación y los puntos de autorización |
| Qué faltaba | Una sección de riesgos y otra de fases (se añaden aquí) y el requisito sobre los despliegues Preview de Vercel (§2) |
| Dependencias | CI de M25 en verde (cumplido: ejecución 42183185691) · el proyecto QA y su referencia, que crea el propietario (T6, T8) · la configuración de Vercel, que es decisión del propietario (§2) |

### Fases propuestas
| Fase | Tareas | ¿Requiere autorización? |
|---|---|---|
| F1 — Configuración y validación | T1 (hecha), T4 | No |
| F2 — Guardas | T2 (build), T3 (ejecución: frontend, Vercel API, Edge) | No |
| F3 — Entorno local | T5 (`gen_local_env.sh` + prueba de humo) | No |
| F4 — Integración | T7 (compuerta de CI y autoprueba) | No |
| F5 — QA | T6 (reinicio de datos: probar en local), T8 (guía del propietario) | Ejecutar en QA o configurar Vercel: **sí** |

### Riesgos
| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Las Preview de Vercel podrían usar variables de Production** (no verificable sin acceso a Vercel) | Código de ramas internas ejecutándose contra datos reales, incluida la service role en `apps/web/api/wompi/*` | Auditoría por el propietario (ver el informe de la fase 2) · requisito R-PREVIEW · las guardas T2/T3 rechazan un host no listado |
| El código acepta `VITE_SUPABASE_URL` y `SUPABASE_URL` indistintamente en el servidor | Un despliegue puede mezclar entornos | T3 |
| Valor por defecto de la llave pública de Wompi en `wompi.js` | Configuración incompleta que no falla | T2/T3 (sin valores por defecto) |
| Sin acceso de la fábrica a Vercel (por diseño) | Las comprobaciones de Vercel dependen del propietario | Guía T8 y comprobaciones del lado del repositorio |

## 2. Requisito adicional R-PREVIEW: sin despliegues Preview automáticos de ramas internas
**Hecho observado (2026-11-06):** cada push autorizado de `db/baseline-m24b` y `mission/m25-ci-governance` generó
despliegues Preview automáticos en los proyectos Vercel `jym.` y `jym-web` (`vercel[bot]`): 4 con el primer push y
al menos 1 más con el push de `1eba099`. Ninguno en Production.

**Requisito:** las ramas internas de la fábrica (`mission/*`, `agent/*`, `db/*`, `ci-selftest/*` y las de tipo
`feat|fix|chore|docs|test|refactor|perf|ci/*`) no deben generar despliegues Preview automáticos. Si alguna vez se
quiere un Preview, debe apuntar a QA y nunca a Production.

**Opciones (ninguna aplicada; todas requieren autorización específica porque cambian el comportamiento de Vercel):**
1. `vercel.json` → `"git": { "deploymentEnabled": { "mission/**": false, "agent/**": false, "db/**": false, … } }`.
   Se versiona en el repositorio, se revisa por PR y aplica a ambos proyectos al publicarse.
2. "Ignored Build Step" en la configuración de cada proyecto Vercel (por ejemplo, salir sin construir si la rama no es `main`).
3. Variables del entorno Preview que apunten solo a QA (o vacías), y protección de los Preview con Vercel Authentication.

**Criterio de aceptación añadido (n.º 9):** un push de una rama interna no genera ningún despliegue (verificable en la API
de deployments de GitHub), o el despliegue generado solo puede apuntar a hosts de QA (guardas T2/T3).

## 3. T1 — `config/environments.json` y validador
### Archivos
| Archivo | Contenido |
|---|---|
| `config/environments.json` | Lista de permitidos: `local` (http/https, `127.0.0.1` y `localhost`) y `qa` (https, lista vacía hasta que el propietario cree QA). Wompi: `sandbox` y `pub_test_` en ambos. Sin secretos ni referencias de proyecto |
| `scripts/env/environments.mjs` | `validateConfig`, `isSupabaseUrlAllowed`, `isWompiPublicKeyAllowed` (funciones puras, sin dependencias) y CLI `validate-config` (exit 0/1/2) |
| `scripts/env/environments.test.mjs` | 19 pruebas `node:test`: 6 positivas, 12 negativas y 1 de seguridad (los mensajes no filtran valores) |

### Decisiones de diseño
- **Production no existe en la configuración**: una entrada `production` (o cualquier otro entorno) es un error. La fábrica
  no almacena la referencia de Production; las guardas rechazan todo host no listado.
- **QA vacío = QA rechazado** hasta que el propietario añada `<ref-qa>.supabase.co` (forma exacta: 20 caracteres, https).
- **Sin valores por defecto:** una URL o llave ausente es un error.
- **Sin filtración de valores:** los mensajes solo nombran campos y entornos; hay una prueba que lo verifica.
- Los hosts de prueba con forma de proyecto real se construyen en tiempo de ejecución (ninguno se versiona).

### Resultados
| Validación | Resultado |
|---|---|
| `node --test scripts/env/environments.test.mjs` | 19/19 |
| Mutaciones (aceptar production · filtrar el host en el mensaje · aceptar http en qa) | Las 3 se detectan (3, 1 y 1 pruebas fallan) |
| `node scripts/env/environments.mjs validate-config` | OK (qa sin configurar) |
| CI quick sobre el commit de T1 (ver el informe) | ver la evidencia del commit |

### Pendiente dentro de M26
- T1 aún no es una compuerta de CI (lo integra T7) ni lo usa el build (T2). Hoy se ejecuta a mano.
- Decisión del propietario: ¿añadir una lista de hosts prohibidos con la referencia de Production como defensa
  adicional? El plan lo evita a propósito (la fábrica no guarda datos de Production); la lista de permitidos ya la rechaza.
