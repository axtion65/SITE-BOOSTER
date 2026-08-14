import assert from "node:assert/strict";
import test from "node:test";
import { buildFalRenderRequest, buildVideoPrompt, sanitizeVisualPrompt, type ExpandedScript } from "./falvideo";
import { compileVideoRenderBrief } from "./videoRenderBrief";

const apparel: ExpandedScript = {
  script: "Big Al's makes custom printed T-shirts for local teams.", hook: "Wear your idea.",
  callToAction: "Get Big Al's custom shirts for $10 today.",
  voiceoverText: "Big Al's custom printed T-shirts are ten dollars. Order yours today.",
  scenes: [
    { sceneNumber: 1, description: "A woman reveals a custom printed T-shirt", duration: "5s", visualDirection: "The shirt front faces camera beside a SALE sign" },
    { sceneNumber: 2, description: "Friends celebrate", duration: "5s", visualDirection: "A poster says BUY NOW" },
  ], suggestedMusic: "subtle upbeat instrumental", estimatedDuration: "30s",
};

const risks = [
  ["Show https://quae.ai on a browser page", /https|browser page/i],
  ["Display the $23 price", /\$23|price/i],
  ["Add a caption reading \"Buy now\"", /caption|buy now/i],
  ["Show five-star reviews", /star review/i],
  ["A countdown timer showing 10", /countdown/i],
  ["Founder studies a computer dashboard", /dashboard/i],
  ["Close-up of the phone UI", /phone ui/i],
  ["Customer reads a sign saying \"SALE\"", /\bsign\b|sale/i],
  ["Macro shot of the packaging label", /packaging label/i],
] as const;
for (const [input, forbidden] of risks) {
  test(`rewrites text-prone prompt: ${input}`, () => assert.doesNotMatch(sanitizeVisualPrompt(input), forbidden));
}

test("safe cinematic prompt remains unchanged", () => {
  const safe = "Slow dolly toward a delighted customer using the matte ceramic product in warm window light.";
  assert.equal(sanitizeVisualPrompt(safe), safe);
});

test("short apparel prompt is one product-hero concept with comprehensive text safety", () => {
  const approvedBefore = JSON.stringify(apparel);
  const brief = compileVideoRenderBrief(apparel, "30s", "ltx-fast");
  const prompt = buildVideoPrompt(apparel, "instagram", "5s", undefined, brief);
  assert.equal(brief.visualBeats.length, 1);
  assert.match(brief.visualProductionBrief, /product is the hero and focal subject/i);
  assert.match(brief.visualProductionBrief, /clear front view|garment surface/i);
  assert.match(prompt, /one continuous product-focused shot/i);
  assert.match(prompt, /no signs, posters, billboards, menus/i);
  assert.match(prompt, /fake lettering.*background writing/i);
  assert.doesNotMatch(prompt, /\$10|ten dollars|order yours|buy now/i);
  assert.doesNotMatch(prompt, /create (?:an? )?logo|invent (?:an? )?logo/i);
  assert.equal(JSON.stringify(apparel), approvedBefore);
});

test("provider request prefers supported image conditioning without making provider calls", () => {
  const request = buildFalRenderRequest(apparel, "instagram", "30s", "ltx-fast", undefined, "https://signed.example/product.jpg");
  assert.match(request.modelPath, /image-to-video/);
  assert.equal(request.input.image_url, "https://signed.example/product.jpg");
});

test("no image falls back and unsupported models safely ignore images", () => {
  const noImage = buildFalRenderRequest(apparel, "instagram", "30s", "ltx-fast");
  assert.match(noImage.modelPath, /text-to-video/);
  assert.equal(noImage.input.image_url, undefined);
  const unsupported = buildFalRenderRequest(apparel, "instagram", "30s", "ovi", undefined, "https://signed.example/product.jpg");
  assert.equal(unsupported.modelPath, "fal-ai/ovi");
  assert.equal(unsupported.input.image_url, undefined);
});
