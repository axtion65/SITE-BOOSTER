import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { mockupCreateSchema, mockupCreateValidationError } from "./mockupCreateRequest";

const productId = "11111111-1111-4111-8111-111111111111";
const brandModelId = "22222222-2222-4222-8222-222222222222";
const base = { productId, campaignId: null, brandModelId, creationPath: "brand_model" as const };

test("POST /mockups accepts an explicit scene direction", () => {
  const parsed = mockupCreateSchema.parse({...base, sceneDirection: {scene: "clean_studio", customScene: ""}});
  assert.deepEqual(parsed.sceneDirection, {scene: "clean_studio", customScene: ""});
});

test("legacy saved Brand Model request defaults the omitted scene direction", () => {
  const result = mockupCreateSchema.safeParse(base);
  assert.equal(result.success, true, "omission must not produce a 400 validation result");
  if (!result.success) return;
  assert.deepEqual(result.data.sceneDirection, {scene: "quae_choice", customScene: ""});
  assert.equal(result.data.productId, productId);
  assert.equal(result.data.brandModelId, brandModelId);
});

test("custom scene still requires non-empty custom direction", () => {
  const result = mockupCreateSchema.safeParse({...base, sceneDirection: {scene: "custom", customScene: "  "}});
  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(mockupCreateValidationError(result.error), "Describe the custom scene to continue");
});

test("creation validation has customer-safe field-specific messages", () => {
  const badProduct = mockupCreateSchema.safeParse({...base, productId: "bad"});
  assert.equal(badProduct.success, false);
  if (!badProduct.success) assert.equal(mockupCreateValidationError(badProduct.error), "Choose a valid product and visual style");
  const badScene = mockupCreateSchema.safeParse({...base, sceneDirection: {scene: "unknown"}});
  assert.equal(badScene.success, false);
  if (!badScene.success) assert.equal(mockupCreateValidationError(badScene.error), "Choose a valid scene direction");
});

test("Prepare visual persists attachments and does not construct a provider", async () => {
  const source = await readFile(new URL("../routes/mockups.ts", import.meta.url), "utf8");
  const prepareStart = source.indexOf('router.post("/mockups"');
  const generateStart = source.indexOf('router.post("/mockups/:id/generate"');
  const prepareRoute = source.slice(prepareStart, generateStart);
  assert.match(prepareRoute, /product_id,campaign_id,brand_model_id,creation_path,creative_direction/);
  assert.match(prepareRoute, /p\.data\.productId.*p\.data\.brandModelId.*p\.data\.creationPath.*sceneDirection:p\.data\.sceneDirection/s);
  assert.doesNotMatch(prepareRoute, /FalMockupImageProvider|createBrandModel|createMockup/);
});
