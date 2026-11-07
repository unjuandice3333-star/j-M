# MASTER STATUS — J&M Autonomous Delivery
Updated: 2026-11-07

## Verified
- `pnpm install --frozen-lockfile` + `pnpm --filter @jm/web build`: OK (reproducible local build).
- `pnpm --filter @jm/web test`: 17 tests pass (Wompi webhook + integrity signature, mocked Supabase).

## Not yet done
- Cart/checkout unit tests (cartStore, wompi.js service)
- RLS verification against a local Supabase (needs Docker/supabase CLI — check availability)
- E2E (Playwright) for catalog -> cart -> checkout
- Admin panel review (products, inventory, orders, coupons)
- Vercel Preview deploy (needs owner credentials/VERCEL token — BLOCKER for deploy only)
- Wompi Sandbox end-to-end (needs sandbox keys — owner)

## Next task
1. Unit tests for `store/cartStore.js` and `services/wompi.js`.
2. Playwright smoke E2E against `vite preview` with mock data.
3. Review RLS migrations for missing policies.
