import { isPlanSlug, PLAN_BY_SLUG } from "@workspace/plans";

export type SubscriptionRevenueSnapshot = {
  plan: string;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  billingInterval: string | null;
};

export function isActivePaidSubscription(
  subscription: SubscriptionRevenueSnapshot,
): boolean {
  return (
    Boolean(subscription.stripeSubscriptionId) &&
    subscription.subscriptionStatus === "active" &&
    isPlanSlug(subscription.plan) &&
    subscription.plan !== "free"
  );
}

export function activeSubscriptionMetrics(
  subscriptions: readonly SubscriptionRevenueSnapshot[],
): { activeSubscriptions: number; mrrCents: number } {
  let activeSubscriptions = 0;
  let mrrCents = 0;

  for (const subscription of subscriptions) {
    if (
      !isActivePaidSubscription(subscription) ||
      !isPlanSlug(subscription.plan)
    )
      continue;
    activeSubscriptions++;
    const plan = PLAN_BY_SLUG[subscription.plan];
    if (subscription.billingInterval === "month") {
      mrrCents += plan.monthlyPriceCents;
    } else if (subscription.billingInterval === "year") {
      mrrCents += Math.round(plan.annualPriceCents / 12);
    }
  }

  return { activeSubscriptions, mrrCents };
}
