import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeClipLength, RENDERING_MODELS } from "@workspace/plans";

test("legacy long drafts normalize without changing their other customer data", () => {
  const draft = { productName: "Customer product", description: "Keep me", duration: "180s", modelId: "veo3" };
  const migrated = { ...draft, duration: normalizeClipLength(draft.modelId, draft.duration) };
  assert.deepEqual(migrated, { ...draft, duration: "8s" });
});

test("the Studio offers one native clip length and no unsupported duration items", () => {
  const studio = readFileSync(new URL("../pages/studio/index.tsx", import.meta.url), "utf8");
  assert.match(studio, /<Label>Clip length<\/Label>/);
  assert.match(studio, /Longer ads will use multiple clips\. Multi-clip production is coming soon\./);
  for (const seconds of [15, 30, 45, 60, 90, 120, 180]) assert.doesNotMatch(studio, new RegExp(`SelectItem value=["']${seconds}s`));
  assert.equal(RENDERING_MODELS.every(model => studio.includes("normalizeClipLength(model.id")), true);
});
