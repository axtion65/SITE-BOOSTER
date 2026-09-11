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

test("customer how-to walkthrough is public, linked, and uses the bundled video", () => {
  const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  const legal = readFileSync(new URL("../pages/legal.tsx", import.meta.url), "utf8");
  const howTo = readFileSync(new URL("../pages/how-to.tsx", import.meta.url), "utf8");

  assert.match(app, /path="\/how-to" component=\{HowTo\}/);
  assert.match(legal, /href="\/how-to"/);
  assert.match(legal, /How to use Quae/);
  assert.match(howTo, /How to use Quae\.ai/);
  assert.match(howTo, /<video/);
  assert.match(howTo, /controls/);
  assert.match(howTo, /playsInline/);
  assert.match(howTo, /src="\/videos\/quae-how-to\.mp4"/);
  assert.match(howTo, /Business Profile → Campaign → Approval → Creative → Download/);
});
