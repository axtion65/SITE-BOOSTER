import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { activeSubscriptionMetrics } from "./adminRevenue";

test("Admin revenue counts only real active Stripe subscriptions", () => {
  const result = activeSubscriptionMetrics([
    {
      plan: "agency",
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      billingInterval: null,
    },
    {
      plan: "pro",
      stripeSubscriptionId: "sub_active",
      subscriptionStatus: "active",
      billingInterval: "month",
    },
    {
      plan: "starter",
      stripeSubscriptionId: "sub_past_due",
      subscriptionStatus: "past_due",
      billingInterval: "month",
    },
    {
      plan: "free",
      stripeSubscriptionId: "sub_invalid",
      subscriptionStatus: "active",
      billingInterval: "month",
    },
  ]);
  assert.deepEqual(result, { activeSubscriptions: 1, mrrCents: 4_900 });
});

test("annual subscriptions contribute normalized monthly recurring revenue", () => {
  assert.deepEqual(
    activeSubscriptionMetrics([
      {
        plan: "starter",
        stripeSubscriptionId: "sub_yearly",
        subscriptionStatus: "active",
        billingInterval: "year",
      },
      {
        plan: "agency",
        stripeSubscriptionId: "sub_monthly",
        subscriptionStatus: "active",
        billingInterval: "month",
      },
    ]),
    { activeSubscriptions: 2, mrrCents: 11_740 },
  );
});

test("the operations query has no plan-only active subscription fallback", async () => {
  const source = await readFile(
    new URL("../routes/admin.ts", import.meta.url),
    "utf8",
  );
  const operations = source.slice(
    source.indexOf('router.get("/admin/operations"'),
    source.indexOf('router.get("/admin/render-debug"'),
  );
  assert.match(operations, /isNotNull\(usersTable\.stripeSubscriptionId\)/);
  assert.match(operations, /eq\(usersTable\.subscriptionStatus, "active"\)/);
  assert.doesNotMatch(operations, /subscriptionStatus\} IS NULL/);
  assert.match(operations, /activeSubscriptionMetrics\(activeUsers\)/);
});
