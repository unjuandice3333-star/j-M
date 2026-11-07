# M31.1 — Continuidad autónoma con gobernanza (PROPUESTA, sin aplicar)

Estado: `.claude/settings.json` NO se ha modificado. No se hizo push, ni ramas remotas, ni cambios en GitHub/Supabase/Vercel.

## 1. Inspección (hechos verificados 2026-11-07)
- `.claude/settings.json` (versionado): solo `permissions.deny` con 24 reglas; **no hay `allow` ni `ask`**. Incluye `Bash(git push:*)`, `Bash(git push)`, `gh api`, `gh pr merge`, `supabase link/db push/functions deploy/secrets/login`, `vercel`, lectura de `.env*`.
- Sin `.claude/settings.local.json`, sin `~/.claude/settings.json`; `~/.claude/remote-settings.json` = `{}`; `policy-limits.json` no contiene reglas de Bash/git.
- Agentes (`.claude/agents/*.md`) repiten "nunca hagas push" como regla de prompt, además del deny.
- Husky existe pero `.husky/` solo tiene `_` (no hay hook pre-push).
- Protección de ramas: `list_branches` devuelve `protected:false` en TODAS las ramas, incluida `main`. **`main` hoy no está protegida en GitHub.** No pude leer rulesets (no hay herramienta autorizada para ello).
- Remoto: `main` = `2661f2a`; `mission/m26-dev-qa-environments` = `b5b70d5` (la rama `claude/gracious-pasteur-rb0qht` no está en el remoto).
- Publicado: todo hasta `b5b70d5`. Solo local: `06d8ad3` y `52d4aac` (ambos existen como commits; árbol limpio antes de este informe).

## 2. Capacidades del mecanismo de permisos (lo que sé y lo que no)
- Las reglas `Bash(...)` comparan la cadena del comando (prefijo con `:*`, glob con `*`); **no entienden la rama destino**. Una regla por rama solo funciona como coincidencia textual exacta del comando.
- Precedencia documentada: `deny` > `ask` > `allow`. Por eso un `allow` específico **no** sirve mientras exista `deny git push:*`: hay que quitar el deny amplio.
- Sin regla coincidente el comando pide confirmación; en una ejecución programada sin humano eso equivale a denegación (es lo que se observó con los pushes).
- Las listas de patrones son evadibles (`git push origin HEAD:refs/heads/main`, alias, `git -c`, scripts). **No se puede garantizar solo con permisos que `main` quede intacta.** Esto lo he razonado a partir de cómo funcionan los patrones; no lo he probado en vivo (probarlo exigiría intentos de push).
- Conclusión: la garantía real debe estar en GitHub (servidor). Los permisos locales son una segunda capa.

## 3. Configuración propuesta (ver `settings.json.proposed.patch`, aplica limpio con `patch --dry-run`)
1. **Quitar** `Bash(git push:*)` y `Bash(git push)` del deny.
2. **Añadir `allow` exactos**: `git push origin mission/m26-dev-qa-environments` y `git push -u origin mission/m26-dev-qa-environments`. Cualquier otro push queda sin allow → pide confirmación → se deniega en modo desatendido.
3. **Añadir denies** para los modos peligrosos: `--force`, `-f`, `--force-with-lease`, `--delete`, `--mirror`, `--all`, `--tags`, `--no-verify`, destinos `main`/`refs/heads/main`, `HEAD:*`, `git -c … push`, y `git commit --no-verify`.
4. No se tocan las demás 22 reglas de M25.
5. No se usan ramas `claude/*`: no son necesarias; el flujo usa una sola rama. (Si el entorno obliga a la rama de sesión, añadir allow exacto con su nombre en una misión posterior.)

Riesgos: (a) patrón evadible por quien controle el prompt del agente → mitigado por el punto 4; (b) un push a la rama de misión publica código no revisado → es la intención, sin merge a `main`; (c) el `allow` exacto se rompe si cambia el nombre de rama → falla cerrado (no publica).

## 4. Protección en el servidor (acción del PROPIETARIO; yo no puedo ni debo hacerla)
En GitHub → Settings → Rules → Rulesets (o Branch protection) para `main`: requerir PR, bloquear force-push y borrado, sin bypass para el token del agente. Si el token de la sesión no es admin ya no podrá tocar `main` aunque falle el patrón local. Verificación posterior: `list_branches` debe mostrar `main` con `protected:true`.
Opcional: hook `pre-push` en `.husky/` que aborte si el destino no es la rama de misión (evadible con `--no-verify`, por eso está denegado).

## 5. Validación (tras aplicar, en sesión nueva; sin publicar)
- `git push --dry-run origin mission/m26-dev-qa-environments` → debe permitirse (no cambia el remoto).
- `git push --dry-run origin HEAD:refs/heads/main` → debe ser denegado por permisos.
- `git push --force origin mission/m26-dev-qa-environments` → denegado.
- `git push origin main` → denegado.
- `git ls-remote origin refs/heads/mission/m26-dev-qa-environments` tras un push real → debe coincidir con `git rev-parse HEAD`.

## 6. Reversión
`git revert <commit-del-cambio>` del settings, o `patch -R -p1 .claude/settings.json < settings.json.proposed.patch`. Efecto: vuelve el deny total del push.

## 7. Recuperación de los commits locales
- `06d8ad3` (completo `06d8ad374b5b942dd16b16c20fc4b9fd99b20563`) y `52d4aac` (completo `52d4aac6b68feacdb9f8ddb6536f60e2ab61c222`).
- `RECOVERY/0001-delivery-cycle1.patch` cubre **solo `06d8ad3`**. `RECOVERY/cycle1.bundle` también **solo `06d8ad3`**.
- Para ambos: `both-commits.bundle` (verificado: cabeza = `52d4aac`) y `both-commits.mbox.patch` (2 parches, 1/2 y 2/2).
- Procedimiento local del propietario:
  `git checkout -b mission/m26-dev-qa-environments origin/mission/m26-dev-qa-environments && git am both-commits.mbox.patch && git push -u origin mission/m26-dev-qa-environments`
  o `git fetch both-commits.bundle mission/m26-dev-qa-environments:recovered` seguido de `git merge --ff-only recovered`.
- SHA-256: bundle `3f7f80a6114153341915adcb9ef9a6487dbaabefee36dba1a86c5381df7c6705`; mbox `e451329eec450ca1f7123b125dacd9421f282acbfa4469df185c61818fcc38f3`; settings patch `e3e5452f5ba4d6dac0ad67ee6bfbed733a9db8497955dd0e113574b8b78ca262`.
- Nota: este informe y la carpeta `M31_1/` se crean después de ambos artefactos, por lo que NO están en ellos.

## 8. Flujo definitivo por ejecución
1. `git fetch origin mission/m26-dev-qa-environments`; `git checkout -B mission/m26-dev-qa-environments origin/mission/m26-dev-qa-environments`.
2. Exigir `git status --porcelain` vacío; si no, parar y preservar (parche/bundle).
3. Leer `MASTER_STATUS.md`, `DECISIONS.md`, `EXECUTION_LOG.md`.
4. Bloqueo anti-concurrencia: si `EXECUTION_LOG.md` muestra `RUN IN PROGRESS` con menos de 90 min de antigüedad, terminar sin trabajar. En caso contrario, escribir `RUN IN PROGRESS <id> <hora>`, commit y push inmediato (el push es fast-forward: si otra ejecución llegó antes, falla y se aborta).
5. Elegir UNA tarea pendiente; implementar; ejecutar `pnpm build`, `pnpm test:unit`, `pnpm test:env`, `eslint`.
6. Commit con atribución.
7. `git push origin mission/m26-dev-qa-environments` (nunca force).
8. Verificar: `git ls-remote origin refs/heads/mission/m26-dev-qa-environments` == `git rev-parse HEAD`. Solo entonces marcar la tarea como persistida.
9. Actualizar estado (`RUN DONE`, commit publicado), commit y push.
10. Si el push falla: generar `bundle` + `format-patch` en la carpeta `RECOVERY/`, entregar como adjunto, notificar, y **no iniciar tareas que dependan de cambios no publicados**.
Frecuencia: programar con un intervalo mayor que la duración máxima de una ejecución; el bloqueo del paso 4 es la segunda barrera.

## 9. Pendiente del propietario
1. Proteger `main` en GitHub (sección 4).
2. Revisar y aprobar `settings.json.proposed.patch`; aplicarlo tú o decirme que lo aplique.
3. Publicar los 2 commits locales (sección 7) o autorizar el push tras aplicar el cambio.
