# Diagnóstico de Supabase QA (`yomgxdjgfjnrjaqiarvw`) — M36.1

## Qué se pudo y qué no
- **No se pudo consultar QA en vivo desde esta sesión**: el proxy de red devuelve 403 al túnel hacia `api.supabase.com` y `*.supabase.co`, y no hay token ni llave de QA en el entorno. No se intentó eludir. **Por tanto, los códigos y mensajes exactos de las respuestas 400/404 NO han sido capturados por mí.**
- Lo que sí hay: (1) el **inventario real de QA de M29** (solo lectura, ya autorizado) y la comparación con el baseline M24; (2) las consultas exactas de la tienda; (3) dos herramientas nuevas para que los códigos exactos salgan en la próxima ejecución del propietario (más abajo).

## Análisis (evidencia de M29 + código; lo marcado «esperado» es inferencia, no captura)
Causa raíz común, ya documentada en M29: **QA no tiene el baseline M24; conserva el esquema heredado** (16 migraciones archivadas + 12 fuera del repositorio, PostgreSQL 17). El frontend de M27/M28 está escrito contra M24.

| Consulta de la tienda (archivo) | En el baseline M24 | En QA según M29 | Respuesta esperada de PostgREST |
|---|---|---|---|
| `shipping_methods` · `select code,name,cost,free_over_subtotal,eta_text` (`orderService.getShippingMethods`) | tabla definida | **no existe** («Pedidos FAIL: faltan … shipping_methods») | **404 `PGRST205`** «Could not find the table 'public.shipping_methods' in the schema cache» — coincide con lo observado |
| `site_content` · `select key,image_url,storage_path,alt_text,title,body,updated_at` (`siteContentService.getAll`) | tabla definida (M28) | **no existe** (falta «portada»; tampoco los buckets `site-content`/`product-images`) | **404 `PGRST205`** — coincide con lo observado |
| `collections` · `select slug,name,subtitle,image_url,collection_products(product_id,position)` + `kind=eq.look`, `is_active=eq.true`, `order=sort_order` (`CompleteTheLook`) | `collections(slug,name,subtitle,image_url,kind,is_active,sort_order)` y `collection_products` | **existe con 0 filas** y columnas del modelo heredado (no listadas en M29) | **400**: `42703` («column collections.kind does not exist») si faltan `kind`/`subtitle`, o `PGRST200` («Could not find a relationship between 'collections' and 'collection_products'») si falta la relación — **cuál de los dos, sin confirmar** |
| `products` con `product_images(...)`, `product_colors(...)`, `variants(... sizes(...))` (`productService`) | relaciones definidas | faltan `product_images` y `product_colors`/colores por producto | **400 `PGRST200`** (esperado); el catálogo vacío y el `alert` son consecuencia directa |
| `v_variant_availability`, `v_product_rating` | vistas definidas | faltan («disponibilidad», «valoraciones») | **404 `PGRST205`** (esperado) |

Conclusión: **no son siete defectos de la tienda ni de Playwright.** Mientras QA no tenga el baseline M24, el catálogo no puede cargar y los 7 smoke no pueden pasar con el Preview apuntando a QA. La única corrección de código (cabecera de bypass) era independiente y ya está hecha.

## Cómo obtener los códigos y mensajes exactos (sin modificar nada)
1. **Playwright (ya instrumentado):** `pnpm test:pw:preview` → la prueba `[3] datos de Supabase` falla listando, por cada respuesta ≥ 400: método, tabla/RPC, **código, mensaje, detalle y pista** (sin tokens ni correos), y adjunta `supabase-errors.json` al reporte HTML.
2. **Diagnóstico de solo lectura con la llave anon:** `pnpm qa:diagnose` (necesita `QA_SUPABASE_URL` y `QA_SUPABASE_ANON_KEY` como variables de entorno). Lee el OpenAPI de PostgREST (qué tablas, columnas y claves foráneas existen para `anon`) y ejecuta las mismas consultas GET de la tienda; imprime código, mensaje, detalle y pista. Solo https, solo el host QA de `config/environments.json` (cualquier otro, incluido Production, se rechaza con exit 2), solo llave con rol `anon` (se rechaza `service_role`), nunca imprime la llave, nunca escribe. 8 pruebas unitarias.
3. Historial de migraciones y diferencias respecto a M24: ya inventariadas en M29 (`MISION_29/01_INVENTARIO_QA_REAL.md`); repetirlas exige el endpoint de lectura autorizado con el token del propietario (no disponible en esta sesión).

## Qué NO se hizo (a propósito)
No se aplicó ninguna migración, no se tocó QA, ni Production (`pgvffddxwvwmerqvzjth`), ni Auth/Storage/Edge Functions. Aplicar M24 sobre QA **no es posible incrementalmente** (M29 R1: fallaría a mitad o dejaría un esquema mezclado).

## Decisión que corresponde al propietario (ruta ya diseñada en M29/M30/M30.1)
1. ¿Son datos de prueba los de QA (23 productos, 20 pedidos, 1 cuenta admin)? Si sí → **A3-R** (recrear QA con M24 + seeds sintéticos); si no → **A3-M** (migrar el catálogo).
2. Cumplir las condiciones de M30.1 **antes** de cualquier reset: copia lógica completa, cifrada y durable de QA, **restauración verificada** (el ensayo local ya dio PASS), y autorización escrita.
3. Tras reconstruir QA: repetir `pnpm qa:diagnose` y `pnpm test:pw:preview`.
Alternativa sin tocar QA: apuntar el Preview a un proyecto Supabase **nuevo y vacío** creado para pruebas con M24 aplicado (requiere añadir su host a `config/environments.json` por PR revisado).
