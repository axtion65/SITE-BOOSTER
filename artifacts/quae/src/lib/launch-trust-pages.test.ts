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
  const home = readFileSync(new URL("../pages/home.tsx", import.meta.url), "utf8");
  const studioLayout = readFileSync(new URL("../pages/studio/layout.tsx", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../pages/studio/dashboard.tsx", import.meta.url), "utf8");
  const video = readFileSync(
    new URL("../../public/videos/quae-how-to.mp4", import.meta.url),
  );

  assert.match(app, /path="\/how-to" component=\{HowTo\}/);
  assert.match(legal, /href="\/how-to"/);
  assert.match(legal, /How to use Quae/);
  assert.match(home, /href="\/how-to"[^>]*>Watch tutorial<\/Link>/);
  assert.match(home, /aria-label="Watch tutorial"/);
  assert.match(studioLayout, /href="\/how-to" label="How to Use"/);
  assert.match(dashboard, /href="\/how-to"/);
  assert.match(dashboard, /Watch Tutorial/);
  assert.match(howTo, /How to use Quae\.ai/);
  assert.match(howTo, /<video/);
  assert.match(howTo, /controls/);
  assert.match(howTo, /playsInline/);
  assert.match(howTo, /src="\/videos\/quae-how-to\.mp4"/);
  assert.match(howTo, /Business Profile → Campaign → Approval → Creative → Download/);
  assert.doesNotMatch(howTo, /48-second/);
  assert.ok(video.length > 100_000, "walkthrough must not be the tiny placeholder");
  assert.ok(video.includes(Buffer.from("avc1")), "walkthrough must include H.264 video");
  assert.ok(video.includes(Buffer.from("mp4a")), "walkthrough must include AAC narration");
});

test("account creation explains its security and legal agreement", () => {
  const signIn = readFileSync(new URL("../pages/signin.tsx", import.meta.url), "utf8");

  assert.match(signIn, /Use at least 8 characters\./);
  assert.match(signIn, /By creating an account, you agree to our/);
  assert.match(signIn, /href="\/terms"[^>]*>Terms of Service<\/Link>/);
  assert.match(signIn, /href="\/privacy"[^>]*>Privacy Policy<\/Link>/);
  assert.match(signIn, /autoComplete="new-password"/);
  assert.match(signIn, /autoComplete="current-password"/);
});
