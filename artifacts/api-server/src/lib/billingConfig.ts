import { PLAN_BY_SLUG, type BillingInterval, type PaidPlanSlug } from "@workspace/plans";

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

type StripePriceSnapshot = {
  active: boolean;
  billing_scheme: string;
  currency: string;
  livemode: boolean;
  product: string | {
    deleted?: boolean | void;
    active?: boolean;
    livemode?: boolean;
    metadata?: Record<string, string>;
  };
  recurring: { interval: string; interval_count: number; usage_type: string } | null;
  transform_quantity: unknown;
  type: string;
  unit_amount: number | null;
};

export type StripeKeyMode = "live" | "test" | "unknown";

export function getStripeKeyMode(key: string | undefined): StripeKeyMode {
  const normalized = key?.trim() ?? "";
  if (normalized.startsWith("sk_live_") || normalized.startsWith("rk_live_")) return "live";
  if (normalized.startsWith("sk_test_") || normalized.startsWith("rk_test_")) return "test";
  return "unknown";
}

export function isProductionBillingEnvironment(env: BillingEnvironment = process.env): boolean {
  return [env.NODE_ENV, env.RAILWAY_ENVIRONMENT_NAME, env.VERCEL_ENV]
    .some(value => value?.trim().toLowerCase() === "production");
}

export function getPublicAppOrigin(env: BillingEnvironment = process.env): string {
  const configured = env.APP_URL?.trim();
  if (!configured) {
    if (isProductionBillingEnvironment(env)) {
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
  const keyMode = getStripeKeyMode(env.STRIPE_API_KEY);
  if (keyMode === "unknown" || (isProductionBillingEnvironment(env) && keyMode !== "live")) {
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

export async function verifyStripeCatalog(
  retrievePrice: (priceId: string) => Promise<StripePriceSnapshot>,
  env: BillingEnvironment = process.env,
): Promise<boolean> {
  if (!isStripeCheckoutReady(env)) return false;
  const expectedLivemode = getStripeKeyMode(env.STRIPE_API_KEY) === "live";

  try {
    const checks = await Promise.all(REQUIRED_STRIPE_PRICES.map(async ([plan, interval]) => {
      const priceId = resolveStripePriceId(plan, interval, env);
      if (!priceId) return false;
      const price = await retrievePrice(priceId);
      const product = price.product;
      const expectedAmount = interval === "month"
        ? PLAN_BY_SLUG[plan].monthlyPriceCents
        : PLAN_BY_SLUG[plan].annualPriceCents;
      return price.active &&
        price.livemode === expectedLivemode &&
        price.billing_scheme === "per_unit" &&
        price.currency.toLowerCase() === "usd" &&
        price.type === "recurring" &&
        price.recurring?.interval === interval &&
        price.recurring.interval_count === 1 &&
        price.recurring.usage_type === "licensed" &&
        price.transform_quantity === null &&
        typeof product === "object" && product !== null &&
        !product.deleted &&
        product.active === true &&
        product.livemode === expectedLivemode &&
        product.metadata?.plan === plan &&
        price.unit_amount === expectedAmount;
    }));
    return checks.every(Boolean);
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
