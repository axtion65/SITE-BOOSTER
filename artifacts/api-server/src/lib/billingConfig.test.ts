import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getStripeKeyMode,
  getPublicAppOrigin,
  isStripeCheckoutReady,
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

test("Stripe catalog verification matches mode, amount, currency, and interval", async () => {
  const prices = new Map([
    ["price_starter_month", { amount: 2300, interval: "month" }],
    ["price_starter_year", { amount: 22080, interval: "year" }],
    ["price_pro_month", { amount: 4900, interval: "month" }],
    ["price_pro_year", { amount: 47040, interval: "year" }],
    ["price_agency_month", { amount: 9900, interval: "month" }],
    ["price_agency_year", { amount: 95040, interval: "year" }],
  ]);
  const retrievePrice = async (priceId: string) => {
    const price = prices.get(priceId);
    if (!price) throw new Error("missing price");
    return {
      active: true,
      currency: "usd",
      livemode: true,
      recurring: { interval: price.interval },
      type: "recurring",
      unit_amount: price.amount,
    };
  };

  assert.equal(await verifyStripeCatalog(retrievePrice, completeBillingEnvironment), true);
  prices.set("price_pro_month", { amount: 1, interval: "month" });
  assert.equal(await verifyStripeCatalog(retrievePrice, completeBillingEnvironment), false);
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
