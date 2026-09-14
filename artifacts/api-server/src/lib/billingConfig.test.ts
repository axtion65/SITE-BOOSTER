import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getPublicAppOrigin,
  isStripeCheckoutReady,
  resolveStripePriceId,
} from "./billingConfig";

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
  const complete = {
    NODE_ENV: "production",
    APP_URL: "https://quae.ai",
    STRIPE_API_KEY: "sk_test_x",
    STRIPE_WEBHOOK_SECRET: "whsec_x",
    STRIPE_PRICE_STARTER_MONTHLY: "price_starter_month",
    STRIPE_PRICE_STARTER_ANNUAL: "price_starter_year",
    STRIPE_PRICE_PRO_MONTHLY: "price_pro_month",
    STRIPE_PRICE_PRO_ANNUAL: "price_pro_year",
    STRIPE_PRICE_AGENCY_MONTHLY: "price_agency_month",
    STRIPE_PRICE_AGENCY_ANNUAL: "price_agency_year",
  };
  assert.equal(isStripeCheckoutReady({ ...complete, STRIPE_API_KEY: "" }), false);
  assert.equal(isStripeCheckoutReady({ ...complete, STRIPE_WEBHOOK_SECRET: "" }), false);
  assert.equal(isStripeCheckoutReady({ ...complete, STRIPE_PRICE_PRO_ANNUAL: "" }), false);
  assert.equal(isStripeCheckoutReady({ ...complete, APP_URL: "javascript:bad" }), false);
  assert.equal(isStripeCheckoutReady(complete), true);
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
