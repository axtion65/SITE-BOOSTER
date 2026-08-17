import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CAMPAIGN_TEMPLATE_PRESETS } from "./campaign-templates";

const home = readFileSync(
  new URL("../pages/home.tsx", import.meta.url),
  "utf8",
);
const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

test("homepage presents Quae as an AI marketing department", () => {
  assert.match(home, /Grow Your Business With an Entire AI Marketing Team/);
  assert.match(home, /Your AI Marketing Department/);
  assert.doesNotMatch(home, /Create TikTok Ads/);
  assert.doesNotMatch(home, /Shopify Videos/);
  assert.doesNotMatch(home, /video in minutes/i);
});

test("homepage CTAs use verified authentication and campaign routes", () => {
  assert.match(home, /Build My First Campaign/);
  assert.match(home, /See How Quae Works/);
  assert.match(home, /SIGNED_OUT_CAMPAIGN_ROUTE = "\/signin"/);
  assert.match(home, /SIGNED_IN_CAMPAIGN_ROUTE = "\/studio\/campaigns"/);
  assert.match(app, /path="\/signin"/);
  assert.match(app, /path="\/studio\/campaigns"/);
});

test("campaign templates, AI team, and approval workflow render", () => {
  assert.match(home, /CAMPAIGN_TEMPLATE_PRESETS\.map/);
  assert.equal(CAMPAIGN_TEMPLATE_PRESETS.length, 7);
  assert.match(home, /Your AI Marketing Team/);
  assert.match(home, /CUSTOMER APPROVAL/);
  assert.match(home, /DRAFT/);
  assert.match(home, /FINAL/);
});

test("homepage embeds no private object paths or signed production URLs", () => {
  assert.doesNotMatch(
    home,
    /private-objects|signedUrl|X-Amz-|storage\/objects|fal\.media|replicate\.delivery/i,
  );
});

test("public pricing remains sourced from the authoritative plan catalog", () => {
  assert.match(home, /id="pricing"/);
  assert.match(home, /PLAN_CATALOG\.map/);
  assert.match(
    home,
    /import \{ PLAN_CATALOG, formatUsd \} from "@workspace\/plans"/,
  );
  assert.match(home, /href="#pricing"/);
});

test("public pricing avoids technical model marketing", () => {
  assert.doesNotMatch(home, /\b(?:Ovi|Wan|Kling|Veo)\b/);
  assert.doesNotMatch(home, /plan\.videos|plan\.features/);
  assert.match(home, /publicPlanBenefits\[plan\.slug\]/);
});

test("pricing uses the exact four-card breakpoint for compact desktop viewports", () => {
  const pricing = home.slice(home.indexOf("function PricingSection"));
  assert.match(
    pricing,
    /grid-cols-1 gap-4 min-\[700px\]:grid-cols-4 min-\[700px\]:gap-2/,
  );
  assert.doesNotMatch(pricing, /min-\[900px\]:grid-cols-4|sm:grid-cols-2/);
});
