# 03 — CORRECCIÓN H3: `supabase/config.toml`

## 1. Hallazgo (M24C)
```
WARN: auth.email.enable_signup is deprecated and will be removed in v4, use auth.email.enabled instead.
```
Aparecía en cada `supabase start` y `supabase db reset`.

## 2. Referencia usada
Se generó la plantilla oficial con `supabase init` (CLI **3.0.0**) en un directorio temporal vacío. Sus secciones de Auth contienen:
```toml
[auth]
enabled = true
enable_signup = true        # vigente: interruptor global de registro
...
[auth.email]
enabled = true              # vigente: habilita el proveedor de email
enable_confirmations = false
```

## 3. Cambio
```diff
 [auth.email]
-enable_signup = true
+# M24D (H3): clave vigente en Supabase CLI 3.x (sustituye a la obsoleta auth.email.enable_signup).
+enabled = true
 enable_confirmations = false
```
- `[auth] enable_signup = true` **se mantiene**: es una clave vigente según la plantilla.
- **Comportamiento de Auth sin cambios:**
  - el registro global sigue habilitado;
  - el proveedor de email sigue habilitado;
  - las confirmaciones por correo siguen desactivadas en local.
- **Verificado por HTTP:** signup 200 y login 200 en ambas reconstrucciones.

## 4. Verificación
| Registro | Advertencias / errores |
|---|---|
| `run1/01_start.log`, `run1/02_reset.log` | **0** |
| `run2/01_start.log`, `run2/02_reset.log` | **0** |

(`evidencias/run*/07_warnings.txt` vacíos.)
