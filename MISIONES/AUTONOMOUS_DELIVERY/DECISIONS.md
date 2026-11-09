# DECISIONS
- D-001 (2026-11-09): La rama `mission/m26-dev-qa-environments` no existe; el entorno exige trabajar en `claude/gracious-pasteur-5o8sgz`. Se usa esta. No se hace merge a main ni PR.
- D-002: vitest elegido como runner (ya es stack Vite). Tests de API mockean `@supabase/supabase-js`.
- D-003: `cartStore` (POS) no es el carrito de la tienda; el carrito persistente de e-commerce vive en `eCommerceStore` (zustand persist).
