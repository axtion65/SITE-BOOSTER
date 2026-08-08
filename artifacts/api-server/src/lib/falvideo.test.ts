import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeVisualPrompt } from "./falvideo";

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
