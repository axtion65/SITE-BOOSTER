---
name: Stripe dev init
description: Stripe initialization is non-fatal in dev — credentials only available when deployed
---

Stripe connector credentials (`REPLIT_CONNECTORS_HOSTNAME` + token) are only available in the **deployed** environment, not in the dev workflow. `initStripe()` in `index.ts` is wrapped in a try/catch that logs a warn and continues — server starts fine in dev without Stripe.

**Why:** The Replit integration proxy requires a deployed identity token. The dev workflow doesn't have `REPL_IDENTITY` or `WEB_REPL_RENEWAL`.

**How to apply:** Always wrap Stripe init (and any `getStripeSync()` / `getUncachableStripeClient()` call at startup) in try/catch. Routes that call Stripe (billing router) can throw at runtime and return 500 — that's acceptable in dev since billing won't be tested locally.
