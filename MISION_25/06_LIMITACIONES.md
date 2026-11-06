# M25 — Limitaciones

1. **Workflow no ejecutado en GitHub.** Para ejecutarlo hace falta push (requiere autorización). Validado con actionlint
   (incluye shellcheck) y ejecutando localmente los mismos scripts. Sin verificar en el runner: los paquetes apt de PG16
   (pgtap, cron), que setup-cli instale la 3.0.0 y gitleaks en Docker con el usuario del runner.
2. **Protección de ramas no aplicada** (cambia permisos externos). Mientras no se aplique, `ci-gate` informa pero no
   bloquea merges en GitHub. Localmente, `run_all.sh` sí bloquea (exit ≠ 0).
3. **Revisor independiente en GitHub:** hace falta una segunda identidad (cuenta de máquina para los agentes o un segundo
   revisor humano). Es decisión del propietario.
4. **La regla 6 es heurística (regex).** Detecta las formas directas, `npx`, la invocación mediante cualquier variable
   (con o sin comillas o llaves) seguida de un subcomando remoto, las banderas `--project-ref`, `--db-url` y `--linked`, y URLs de proyecto. Una ofuscación deliberada (por ejemplo, codificación o eval) no se puede detectar estáticamente. Las
   defensas de fondo son: la sesión no tiene credenciales remotas, el workflow no tiene secretos, y las reglas de
   denegación de Claude Code.
5. **qa y reviewer tienen Bash:** su "solo lectura" no es un aislamiento técnico completo (pueden escribir con Bash).
6. **Las reglas de denegación** comparan prefijos de comando; una invocación indirecta podría evadirlas.
7. **La autoprueba no inyecta defectos en las etapas de BD** (minutos por caso). Esas etapas tienen aserciones propias
   (≥290 pruebas, instantáneas no vacías e idénticas, 39/39 HTTP, redacción verificada).
8. **El stack de Supabase local** admite una sola instancia por máquina (puertos 5432x). Las etapas de BD de varios
   agentes deben ejecutarse una tras otra.
9. **El contenedor de la sesión es efímero:** sin los bundles entregados, el trabajo local se pierde al reciclarse.
11. **Workflow modificado por un PR.** Un PR puede cambiar los pasos de un job manteniendo su nombre. Solo lo impide la
    revisión obligatoria de CODEOWNERS (pendiente de una segunda identidad). `trusted-policy` protege la política de
    migraciones, no el workflow.
10. **Las 24 advertencias de ESLint** (variables sin usar) no bloquean; se tratarán en una misión de calidad.
