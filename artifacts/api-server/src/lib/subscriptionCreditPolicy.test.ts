import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  nextMonthlyAnniversary,
  shouldGrantPlanAllowance,
  shouldRefreshPaidPlanAllowance,
  type AllowanceState,
  type PaidSubscriptionSnapshot,
} from "./subscriptionCreditPolicy";

const base: AllowanceState = {
  plan: "pro",
  stripeSubscriptionId: "sub_1",
  subscriptionStatus: "active",
  creditCycleAnchorAt: new Date("2026-01-31T12:00:00.000Z"),
  creditRefreshAt: new Date("2026-02-28T12:00:00.000Z"),
  isAdmin: false,
};
const snapshot: PaidSubscriptionSnapshot = {
  customerId: "cus_1",
  subscriptionId: "sub_1",
  plan: "pro",
  status: "active",
  billingInterval: "year",
  anchorAt: new Date("2026-01-31T12:00:00.000Z"),
};

test("monthly anniversaries preserve the original billing day across short months", () => {
  const anchor = new Date("2026-01-31T12:00:00.000Z");
  assert.equal(nextMonthlyAnniversary(anchor, anchor).toISOString(), "2026-02-28T12:00:00.000Z");
  assert.equal(
    nextMonthlyAnniversary(anchor, new Date("2026-02-28T12:00:00.000Z")).toISOString(),
    "2026-03-31T12:00:00.000Z",
  );
});

test("repeated sync of the same active subscription cannot grant another allowance", () => {
  assert.equal(shouldGrantPlanAllowance(base, snapshot), false);
  assert.equal(shouldGrantPlanAllowance(base, { ...snapshot, subscriptionId: "sub_2" }), true);
  assert.equal(shouldGrantPlanAllowance(base, { ...snapshot, plan: "agency" }), true);
  assert.equal(shouldGrantPlanAllowance(base, { ...snapshot, status: "past_due", subscriptionId: "sub_2" }), false);
});

test("paid annual subscriptions refresh by monthly entitlement clock, not invoice interval", () => {
  assert.equal(shouldRefreshPaidPlanAllowance(base, new Date("2026-02-27T12:00:00.000Z")), false);
  assert.equal(shouldRefreshPaidPlanAllowance(base, new Date("2026-02-28T12:00:00.000Z")), true);
  assert.equal(shouldRefreshPaidPlanAllowance({ ...base, creditCycleAnchorAt: null }, new Date()), true);
  assert.equal(shouldRefreshPaidPlanAllowance({ ...base, plan: "free" }, new Date("2026-03-01T00:00:00.000Z")), false);
});

test("Stripe sync and webhooks share the serialized allowance reconciler", () => {
  const service = readFileSync(new URL("../stripeService.ts", import.meta.url), "utf8");
  const webhook = readFileSync(new URL("../webhookHandlers.ts", import.meta.url), "utf8");
  const billing = readFileSync(new URL("../routes/billing.ts", import.meta.url), "utf8");
  assert.match(service, /applyPaidSubscriptionSnapshot/);
  assert.match(webhook, /stripeService\.syncSubscriptionToUser/);
  assert.doesNotMatch(service, /credits:\s*PLAN_BY_SLUG/);
  assert.doesNotMatch(webhook, /PLAN_BY_SLUG\[plan\]\.credits/);
  assert.match(billing, /grantReason === "subscription_change"/);
});
