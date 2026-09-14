import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ExpandPromptBody, RegenerateSceneBody } from "@workspace/api-zod";

const expandInput = {
  description: "A useful product",
  productName: "Example",
  targetAudience: "Busy small-business owners",
  platform: "instagram",
  duration: "30s",
  renderingModelId: "ltx-video-2.3-fast",
  templateType: "product-demo",
  templateName: "Product demo",
};

const regenerateInput = {
  sceneIndex: 0,
  sceneNumber: 1,
  currentDescription: "Show the product",
  currentVisualDirection: "Close-up in natural light",
  totalScenes: 4,
  productName: "Example",
  description: "A useful product",
  targetAudience: "Busy small-business owners",
  platform: "instagram",
  duration: "30s",
  templateType: "product-demo",
  templateName: "Product demo",
  hint: "Make the benefit easier to see",
};

test("script expansion accepts bounded production context and rejects oversized prompt fields", () => {
  assert.equal(ExpandPromptBody.safeParse(expandInput).success, true);
  for (const [field, value] of Object.entries({
    description: "x".repeat(4001),
    productName: "x".repeat(201),
    targetAudience: "x".repeat(1001),
    platform: "x".repeat(101),
    duration: "x".repeat(21),
    renderingModelId: "x".repeat(101),
    templateType: "x".repeat(101),
    templateName: "x".repeat(201),
  })) {
    assert.equal(ExpandPromptBody.safeParse({ ...expandInput, [field]: value }).success, false, field);
  }
});

test("scene regeneration rejects oversized prompt fields and out-of-range coordinates", () => {
  assert.equal(RegenerateSceneBody.safeParse(regenerateInput).success, true);
  for (const [field, value] of Object.entries({
    currentDescription: "x".repeat(4001),
    currentVisualDirection: "x".repeat(4001),
    productName: "x".repeat(201),
    description: "x".repeat(4001),
    targetAudience: "x".repeat(1001),
    platform: "x".repeat(101),
    duration: "x".repeat(21),
    templateType: "x".repeat(101),
    templateName: "x".repeat(201),
    hint: "x".repeat(1001),
  })) {
    assert.equal(RegenerateSceneBody.safeParse({ ...regenerateInput, [field]: value }).success, false, field);
  }
  assert.equal(RegenerateSceneBody.safeParse({ ...regenerateInput, sceneIndex: -1 }).success, false);
  assert.equal(RegenerateSceneBody.safeParse({ ...regenerateInput, sceneNumber: 101 }).success, false);
  assert.equal(RegenerateSceneBody.safeParse({ ...regenerateInput, totalScenes: 101 }).success, false);
});

test("studio provider prompts read request data only through generated validators", async () => {
  const source = await readFile(new URL("../routes/studio.ts", import.meta.url), "utf8");
  const expand = source.slice(source.indexOf('router.post("/studio/expand-prompt"'), source.indexOf("// Per-scene regeneration"));
  const regenerate = source.slice(source.indexOf('router.post("/studio/regenerate-scene"'));

  assert.equal(expand.match(/req\.body/g)?.length, 1);
  assert.equal(regenerate.match(/req\.body/g)?.length, 1);
  assert.match(expand, /ExpandPromptBody\.safeParse\(req\.body\)/);
  assert.match(regenerate, /RegenerateSceneBody\.safeParse\(req\.body\)/);
  assert.match(regenerate, /Number\.isInteger/);
});
