import assert from "node:assert/strict";
import test from "node:test";
import { CreateProjectBody } from "@workspace/api-zod";
import { RENDERING_MODELS } from "@workspace/plans";
import { normalizeProductionModelDuration, normalizeProjectSubmissionBody, projectValidationIssueFields } from "./projectSubmission";

test("every selectable model canonicalizes a legacy Amazon draft before project validation", () => {
  for (const model of RENDERING_MODELS) {
    assert.equal(normalizeProductionModelDuration(model.id, "5s"), "30s");
    const normalized = normalizeProjectSubmissionBody({
      title: "Amazon listing advert",
      description: "Approved product description",
      renderingModelId: model.id,
      expandedScript: JSON.stringify({ voiceoverText: "Approved narration", scenes: [{ description: "Product hero" }] }),
      platform: "amazon",
      duration: "5s",
      templateId: "amazon-listing",
      sourceAssetId: "/objects/uploads/product.png",
      productImageUrl: "/api/storage/objects/uploads/product.png",
      voiceId: "alloy",
    });
    const parsed = CreateProjectBody.safeParse(normalized);
    assert.equal(parsed.success, true, parsed.success ? undefined : JSON.stringify(parsed.error.issues));
    if (!parsed.success) continue;
    assert.equal(parsed.data.renderingModelId, model.id);
    assert.equal(parsed.data.duration, "30s");
    assert.equal(parsed.data.renderIntent, "animate");
  }
});

test("validation diagnostics report field names without logging customer values", () => {
  const parsed = CreateProjectBody.safeParse(normalizeProjectSubmissionBody({ title: 42, renderingModelId: "kling" }));
  assert.equal(parsed.success, false);
  if (parsed.success) return;
  assert.deepEqual(projectValidationIssueFields(parsed.error.issues), ["title"]);
});
