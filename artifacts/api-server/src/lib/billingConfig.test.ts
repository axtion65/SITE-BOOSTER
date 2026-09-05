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

test("checkout is disabled unless API and webhook secrets are both present", () => {
  assert.equal(isStripeCheckoutReady({ STRIPE_API_KEY: "sk_test_x" }), false);
  assert.equal(isStripeCheckoutReady({ STRIPE_WEBHOOK_SECRET: "whsec_x" }), false);
  assert.equal(isStripeCheckoutReady({
    STRIPE_API_KEY: "sk_test_x",
    STRIPE_WEBHOOK_SECRET: "whsec_x",
  }), true);
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
  assert.doesNotMatch(billing, /REPLIT_DOMAINS|localhost:3000/);
  assert.match(webhook, /if \(!webhookSecret\) throw/);
  assert.doesNotMatch(webhook, /JSON\.parse\(payload|skipping signature verification/);
});
