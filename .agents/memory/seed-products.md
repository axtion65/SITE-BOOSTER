---
name: Seed products
description: Stripe product seed script — needs deployment credentials to run
---

Seed script lives at `artifacts/api-server/scripts/seed-products.ts`. Run with:
```
pnpm exec tsx artifacts/api-server/scripts/seed-products.ts
```

This only works in a deployed environment (Stripe credentials need deployment token). Creates 3 products (Starter, Pro, Agency) with monthly + annual prices. Annual = monthly × 12 × 0.80 (20% discount).

Product metadata must include `{ plan: "starter" | "pro" | "agency" }` — this is how `stripeService.syncUserSubscription` determines the plan and credit allocation after checkout.

**Why:** After checkout, `POST /api/billing/sync` reads the active subscription, retrieves the product, and uses `metadata.plan` to look up credits in `PLAN_CREDITS`.
