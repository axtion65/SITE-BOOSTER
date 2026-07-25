---
name: Credit system
description: Model credit costs, plan allocations, and billing sync approach
---

## Model credit costs (1 credit = $0.01)
- Ovi (`quae-v1` or `ovi`): 30 credits → $0.20 fal.ai cost
- Wan 2.5 (`wan`): 200 credits → $1.50 fal.ai cost  
- Kling 2.5 (`kling`): 300 credits → $2.10 fal.ai cost
- Veo 3 (`veo3`): 1500 credits → $12 fal.ai cost

## Plan credit allocations
- free: 90 credits (3 Ovi videos)
- starter: 600 credits ($29/mo)
- pro: 2000 credits ($49/mo)
- agency: 6000 credits ($149/mo)

## Billing sync approach
After checkout success, frontend calls `POST /api/billing/sync`. Server reads active subscription from Stripe, determines plan from product metadata (`metadata.plan`), looks up credits from `PLAN_CREDITS` map, and updates `users` table.

**Why:** Simpler than parsing webhook events for the initial credit assignment. Webhook events from stripe-replit-sync are synced to `stripe.*` tables but don't automatically update the `users` table.
