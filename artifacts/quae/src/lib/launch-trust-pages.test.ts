import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("public launch trust pages are routed and discoverable", () => {
  const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  const legal = readFileSync(new URL("../pages/legal.tsx", import.meta.url), "utf8");

  for (const path of ["/privacy", "/terms", "/refund-policy", "/contact"]) {
    assert.match(app, new RegExp(`path=\\"${path.replace("/", "\\/")}\\"`));
    assert.match(legal, new RegExp(`href=\\"${path.replace("/", "\\/")}\\"`));
  }

  assert.match(legal, /info@quae\.ai/);
  assert.match(legal, /JB@H Procurement Group LLC/);
  assert.match(legal, /Cancellation takes effect at the end of the current paid billing period/);
  assert.match(legal, /does not automatically issue prorated refunds/);
  assert.match(legal, /except where required by applicable law/);
  assert.match(legal, /Payment card details are processed by Stripe/);
  assert.match(app, /<PublicTrustLinks \/>/);
});
