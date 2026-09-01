import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeClipLength, RENDERING_MODELS } from "@workspace/plans";

test("legacy long drafts normalize without changing their other customer data", () => {
  const draft = { productName: "Customer product", description: "Keep me", duration: "180s", modelId: "veo3" };
  const migrated = { ...draft, duration: normalizeClipLength(draft.modelId, draft.duration) };
  assert.deepEqual(migrated, { ...draft, duration: "30s" });
});

test("the Studio offers complete 15, 30, and 45 second adverts", () => {
  const studio = readFileSync(new URL("../pages/studio/index.tsx", import.meta.url), "utf8");
  assert.match(studio, /<Label>Advert length<\/Label>/);
  assert.match(studio, /voiceover, captions, branding, and CTA/i);
  for (const seconds of [15, 30, 45]) assert.match(studio, new RegExp(`value=["']${seconds}s`));
  for (const seconds of [5, 10, 60, 90, 120, 180]) assert.doesNotMatch(studio, new RegExp(`SelectItem[^>]*value=["']${seconds}s`));
  assert.equal(RENDERING_MODELS.every(model => studio.includes("normalizeClipLength(model.id")), true);
});
