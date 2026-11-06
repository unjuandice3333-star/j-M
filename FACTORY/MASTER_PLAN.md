# Plan maestro — Fábrica de software J&M FASHION STORE

**Objetivo:** llevar J&M FASHION STORE a un estado liberable mediante misiones pequeñas, verificables y reversibles,
ejecutadas por una fábrica de agentes con gobierno, CI obligatoria y aislamiento total de Production.

## Hoja de ruta (orden de ejecución)

| Orden | Misión | Objetivo | Estado | Punto de autorización humana |
|---|---|---|---|---|
| — | M23 | Auditoría integral | Terminada | — |
| — | M24A–D | Diseño, línea base de BD, validación Supabase y correcciones | Terminada (commits 9183090, 67312b0, 465e294) | — |
| — | Preservación M24 | Bundle, exportación, inventario, restauración | Terminada (3710615) | — |
| 1 | **M25** | CI, ramas y gobierno | En curso → ver MISSION_REGISTRY | Push de la rama; aplicar protección de ramas |
| 2 | M26 | Entornos dev/QA separados, datos de prueba, secretos fuera del código | Pendiente | Crear el proyecto QA y sus credenciales (lo hace el propietario) |
| 3 | M35 | Piloto de la fábrica: una misión real ejecutada de punta a punta por agentes | Pendiente | Integrar el resultado |
| 4 | M27–M34 | Funcionalidades y endurecimiento (catálogo, checkout, pagos Wompi, panel, E2E…) | Pendiente | Por misión |
| 5 | M36 | Preparación de la liberación | Pendiente | Despliegue (solo el propietario) |

## Principios
1. **Ejecutar, no proponer.** Cada misión termina en un commit local verificado y un informe.
2. **Nada sin pruebas.** Toda compuerta debe pasar. BLOCKED o SKIPPED nunca equivalen a PASS.
3. **Producción fuera de alcance.** Ver ENVIRONMENT_POLICY.md. No negociable.
4. **Reversibilidad.** Todo el trabajo queda en commits locales y bundles verificables (ver RECOVERY_GUIDE.md).
5. **Honestidad.** Las limitaciones y los fallos se documentan; nunca se simulan resultados ni agentes.
