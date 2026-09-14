import type { BillingInterval, PaidPlanSlug } from "@workspace/plans";

type BillingEnvironment = Record<string, string | undefined>;

const PRICE_ENV: Record<PaidPlanSlug, Record<BillingInterval, string>> = {
  starter: { month: "STRIPE_PRICE_STARTER_MONTHLY", year: "STRIPE_PRICE_STARTER_ANNUAL" },
  pro: { month: "STRIPE_PRICE_PRO_MONTHLY", year: "STRIPE_PRICE_PRO_ANNUAL" },
  agency: { month: "STRIPE_PRICE_AGENCY_MONTHLY", year: "STRIPE_PRICE_AGENCY_ANNUAL" },
};

const REQUIRED_STRIPE_PRICES = [
  ["starter", "month"],
  ["starter", "year"],
  ["pro", "month"],
  ["pro", "year"],
  ["agency", "month"],
  ["agency", "year"],
] as const satisfies readonly (readonly [PaidPlanSlug, BillingInterval])[];

export function getPublicAppOrigin(env: BillingEnvironment = process.env): string {
  const configured = env.APP_URL?.trim();
  if (!configured) {
    if (env.NODE_ENV === "production") {
      throw new Error("APP_URL is required for production billing redirects");
    }
    return "http://localhost:3000";
  }

  const url = new URL(configured);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("APP_URL must be a public HTTP(S) origin");
  }
  return url.origin;
}

export function isStripeCheckoutReady(env: BillingEnvironment = process.env): boolean {
  if (!env.STRIPE_API_KEY?.trim() || !env.STRIPE_WEBHOOK_SECRET?.trim()) {
    return false;
  }
  if (!REQUIRED_STRIPE_PRICES.every(([plan, interval]) =>
    resolveStripePriceId(plan, interval, env))) {
    return false;
  }
  try {
    getPublicAppOrigin(env);
    return true;
  } catch {
    return false;
  }
}

export function resolveStripePriceId(
  plan: PaidPlanSlug,
  interval: BillingInterval,
  env: BillingEnvironment = process.env,
): string | undefined {
  const canonical = env[PRICE_ENV[plan][interval]]?.trim();
  if (canonical) return canonical;

  // Preserve the one legacy Railway variable while the environment is renamed.
  if (plan === "agency" && interval === "year") {
    return env.STRIPE_PRICE_AGENCY_annual?.trim() || undefined;
  }
  return undefined;
}
