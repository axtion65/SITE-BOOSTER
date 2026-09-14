import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getStripeKeyMode,
  getPublicAppOrigin,
  isStripeCheckoutReady,
  isProductionBillingEnvironment,
  resolveStripePriceId,
  verifyStripeCatalog,
} from "./billingConfig";

const completeBillingEnvironment = {
  NODE_ENV: "production",
  APP_URL: "https://quae.ai",
  STRIPE_API_KEY: "sk_live_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  STRIPE_PRICE_STARTER_MONTHLY: "price_starter_month",
  STRIPE_PRICE_STARTER_ANNUAL: "price_starter_year",
  STRIPE_PRICE_PRO_MONTHLY: "price_pro_month",
  STRIPE_PRICE_PRO_ANNUAL: "price_pro_year",
  STRIPE_PRICE_AGENCY_MONTHLY: "price_agency_month",
  STRIPE_PRICE_AGENCY_ANNUAL: "price_agency_year",
};

test("production billing redirects use APP_URL and never localhost", () => {
  assert.equal(
    getPublicAppOrigin({ NODE_ENV: "production", APP_URL: "https://quae.ai/studio" }),
    "https://quae.ai",
  );
  assert.throws(
    () => getPublicAppOrigin({ NODE_ENV: "production" }),
    /APP_URL is required/,
  );
  assert.throws(
    () => getPublicAppOrigin({ RAILWAY_ENVIRONMENT_NAME: "production" }),
    /APP_URL is required/,
  );
});

test("Railway and Vercel production markers enforce live billing", () => {
  assert.equal(isProductionBillingEnvironment({ RAILWAY_ENVIRONMENT_NAME: "production" }), true);
  assert.equal(isProductionBillingEnvironment({ VERCEL_ENV: "production" }), true);
  assert.equal(isProductionBillingEnvironment({ NODE_ENV: "development" }), false);
  assert.equal(isStripeCheckoutReady({
    ...completeBillingEnvironment,
    NODE_ENV: undefined,
    RAILWAY_ENVIRONMENT_NAME: "production",
    STRIPE_API_KEY: "sk_test_x",
  }), false);
});

test("checkout is disabled unless every required Stripe setting is present", () => {
  assert.equal(isStripeCheckoutReady({ ...completeBillingEnvironment, STRIPE_API_KEY: "" }), false);
  assert.equal(isStripeCheckoutReady({ ...completeBillingEnvironment, STRIPE_API_KEY: "sk_test_x" }), false);
  assert.equal(isStripeCheckoutReady({ ...completeBillingEnvironment, STRIPE_WEBHOOK_SECRET: "" }), false);
  assert.equal(isStripeCheckoutReady({ ...completeBillingEnvironment, STRIPE_PRICE_PRO_ANNUAL: "" }), false);
  assert.equal(isStripeCheckoutReady({ ...completeBillingEnvironment, APP_URL: "javascript:bad" }), false);
  assert.equal(isStripeCheckoutReady(completeBillingEnvironment), true);
});

test("Stripe key mode recognizes live and test secret or restricted keys", () => {
  assert.equal(getStripeKeyMode("sk_live_x"), "live");
  assert.equal(getStripeKeyMode("rk_live_x"), "live");
  assert.equal(getStripeKeyMode("sk_test_x"), "test");
  assert.equal(getStripeKeyMode("rk_test_x"), "test");
  assert.equal(getStripeKeyMode("pk_live_x"), "unknown");
});

const stripePriceSpecs = new Map([
  ["price_starter_month", { plan: "starter", amount: 2300, interval: "month" }],
  ["price_starter_year", { plan: "starter", amount: 22080, interval: "year" }],
  ["price_pro_month", { plan: "pro", amount: 4900, interval: "month" }],
  ["price_pro_year", { plan: "pro", amount: 47040, interval: "year" }],
  ["price_agency_month", { plan: "agency", amount: 9900, interval: "month" }],
  ["price_agency_year", { plan: "agency", amount: 95040, interval: "year" }],
]);

function validStripePrice(priceId: string) {
  const spec = stripePriceSpecs.get(priceId);
  if (!spec) throw new Error("missing fixture price");
  return {
    active: true,
    billing_scheme: "per_unit",
    currency: "usd",
    livemode: true,
    product: {
      id: `prod_${spec.plan}`,
      active: true,
      livemode: true,
      metadata: { plan: spec.plan },
    },
    recurring: { interval: spec.interval, interval_count: 1, usage_type: "licensed" },
    transform_quantity: null,
    type: "recurring",
    unit_amount: spec.amount,
  };
}

test("Stripe catalog accepts all six fixed subscription prices with their correct credit plan", async () => {
  const retrieved: string[] = [];
  assert.equal(await verifyStripeCatalog(async priceId => {
    retrieved.push(priceId);
    return validStripePrice(priceId);
  }, completeBillingEnvironment), true);
  assert.deepEqual(retrieved.sort(), [...stripePriceSpecs.keys()].sort());
});

const invalidStripePriceCases: [string, (price: ReturnType<typeof validStripePrice>) => unknown][] = [
  ["missing product plan metadata", price => ({ ...price, product: { ...price.product, metadata: {} } })],
  ["wrong product credit plan", price => ({ ...price, product: { ...price.product, metadata: { plan: "starter" } } })],
  ["free product credit plan", price => ({ ...price, product: { ...price.product, metadata: { plan: "free" } } })],
  ["unexpanded product", price => ({ ...price, product: price.product.id })],
  ["deleted product", price => ({ ...price, product: { id: price.product.id, deleted: true } })],
  ["inactive product", price => ({ ...price, product: { ...price.product, active: false } })],
  ["test mode product", price => ({ ...price, product: { ...price.product, livemode: false } })],
  ["three-month billing frequency", price => ({ ...price, recurring: { ...price.recurring, interval_count: 3 } })],
  ["metered usage", price => ({ ...price, recurring: { ...price.recurring, usage_type: "metered" } })],
  ["tiered billing", price => ({ ...price, billing_scheme: "tiered" })],
  ["transformed quantity", price => ({ ...price, transform_quantity: { divide_by: 5, round: "up" } })],
  ["wrong amount", price => ({ ...price, unit_amount: 1 })],
  ["inactive price", price => ({ ...price, active: false })],
  ["wrong currency", price => ({ ...price, currency: "eur" })],
  ["wrong interval", price => ({ ...price, recurring: { ...price.recurring, interval: "year" } })],
  ["test mode price", price => ({ ...price, livemode: false })],
  ["one-time price", price => ({ ...price, type: "one_time", recurring: null })],
];

for (const [description, invalidate] of invalidStripePriceCases) {
  test(`Stripe catalog rejects ${description} even when the other five prices are valid`, async () => {
    assert.equal(await verifyStripeCatalog(async priceId => {
      const price = validStripePrice(priceId);
      // External Stripe responses can contain each of these incompatible shapes.
      return (priceId === "price_pro_month" ? invalidate(price) : price) as ReturnType<typeof validStripePrice>;
    }, completeBillingEnvironment), false);
  });
}

test("Stripe catalog fails closed when a price cannot be retrieved", async () => {
  assert.equal(await verifyStripeCatalog(async priceId => {
    if (priceId === "price_pro_month") throw new Error("Stripe unavailable");
    return validStripePrice(priceId);
  }, completeBillingEnvironment), false);
});

test("the canonical Agency annual price wins while the legacy Railway name remains compatible", () => {
  assert.equal(resolveStripePriceId("agency", "year", {
    STRIPE_PRICE_AGENCY_annual: "price_legacy",
  }), "price_legacy");
  assert.equal(resolveStripePriceId("agency", "year", {
    STRIPE_PRICE_AGENCY_ANNUAL: "price_canonical",
    STRIPE_PRICE_AGENCY_annual: "price_legacy",
  }), "price_canonical");
});

test("billing routes use the public app origin and Stripe webhooks fail closed", () => {
  const billing = readFileSync(new URL("../routes/billing.ts", import.meta.url), "utf8");
  const webhook = readFileSync(new URL("../webhookHandlers.ts", import.meta.url), "utf8");
  assert.match(billing, /getPublicAppOrigin\(\)/);
  assert.match(billing, /isCheckoutCatalogReady\(\)/);
  assert.match(billing, /studio\/billing\?checkout_success=true/);
  assert.doesNotMatch(billing, /studio\/dashboard\?checkout_success=true/);
  assert.doesNotMatch(billing, /REPLIT_DOMAINS|localhost:3000/);
  assert.match(webhook, /if \(!webhookSecret\) throw/);
  assert.doesNotMatch(webhook, /JSON\.parse\(payload|skipping signature verification/);
});

test("Checkout delegates eligible payment methods to Stripe", () => {
  const service = readFileSync(new URL("../stripeService.ts", import.meta.url), "utf8");
  assert.match(service, /stripe\.checkout\.sessions\.create/);
  assert.match(service, /mode: 'subscription'/);
  assert.doesNotMatch(service, /payment_method_types/);
});
