import assert from "node:assert/strict";
import test from "node:test";
import { RENDERING_MODELS } from "@workspace/plans";
import { buildStudioProjectRequest } from "./studio-project-request";

const expandedScript = {
  script: "Approved product script",
  hook: "Meet the product",
  callToAction: "Shop now",
  scenes: [{ sceneNumber: 1, description: "Product hero", duration: "5s", visualDirection: "Clean studio motion" }],
  voiceoverText: "Meet the product. Shop now.",
};

test("Amazon drafts submit one schema-safe request for every selectable model", () => {
  for (const model of RENDERING_MODELS) {
    const request = buildStudioProjectRequest({
      campaignId: null,
      campaignVideoBriefId: null,
      idempotencyKey: `amazon-${model.id}`,
      productName: "Customer product",
      description: "Approved description",
      modelId: model.id,
      expandedScript,
      platform: "amazon",
      duration: "5s",
      templateId: "amazon-listing",
      renderIntent: "animate",
      productImageUrl: "/api/storage/objects/uploads/product.png",
      voiceId: "alloy",
    });
    assert.equal(request.renderingModelId, model.id);
    assert.equal(request.duration, "30s");
    assert.equal(request.renderIntent, "animate");
    assert.equal(request.sourceAssetId, "/objects/uploads/product.png");
    assert.equal(request.productImageUrl, "/api/storage/objects/uploads/product.png");
  }
});

test("Create New strips image fields while keeping the explicit shared render intent", () => {
  const request = buildStudioProjectRequest({
    campaignId: null,
    campaignVideoBriefId: null,
    idempotencyKey: "create-new",
    productName: "Customer product",
    description: "Approved description",
    modelId: "kling",
    expandedScript,
    platform: "tiktok",
    duration: "15s",
    renderIntent: "create_new",
    productImageUrl: "/api/storage/objects/uploads/product.png",
    voiceId: "alloy",
  });
  assert.equal(request.renderIntent, "create_new");
  assert.equal(request.sourceAssetId, null);
  assert.equal(request.productImageUrl, null);
});

test("a campaign without a prepared visual brief cannot silently submit Animate", () => {
  const request = buildStudioProjectRequest({
    campaignId: "campaign-1",
    campaignVideoBriefId: null,
    idempotencyKey: "campaign-without-brief",
    productName: "Customer product",
    description: "Approved description",
    modelId: "ltx-fast",
    expandedScript,
    platform: "amazon",
    duration: "15s",
    renderIntent: "animate",
    productImageUrl: "/api/storage/objects/uploads/unconfirmed.png",
    voiceId: "alloy",
  });
  assert.equal(request.renderIntent, "create_new");
  assert.equal(request.sourceAssetId, null);
  assert.equal(request.productImageUrl, null);
});
