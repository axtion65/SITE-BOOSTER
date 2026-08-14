import test from "node:test";
import assert from "node:assert/strict";
import { buildApprovedCampaignHandoff } from "./campaign-handoff";

function campaign(overrides: Record<string, unknown> = {}) {
  return {
    id: "campaign-1",
    name: "Big Al T-Shirt Campaign",
    status: "approved",
    approved_run_id: "run-2",
    brief: {
      objective: "Get more local customers",
      channel: "Instagram",
      duration: "30 seconds",
    },
    runs: [
      {
        id: "run-3",
        status: "needs_revision",
        final_result: { finalScript: { script: "Wrong", hook: "Wrong", callToAction: "Wrong" }, factcheck: { pass: false }, qa: { pass: false } },
      },
      {
        id: "run-2",
        status: "ready_for_review",
        context_snapshot: {
          business: { name: "Big Al's", description: "Local custom printing" },
          product: {
            name: "tshirt",
            description: "Premium custom T-shirt",
            benefits: ["Comfortable for everyday wear"],
            features: ["Professional-looking custom printing"],
            targetAudience: "Local customers",
            primaryImage: "/objects/uploads/shirt",
          },
        },
        final_result: {
          strategy: { audience: "Fallback audience" },
          finalScript: {
            hook: "Your message, made wearable.",
            script: "Your message, made wearable. Big Al's custom T-shirts—$10.\nOrder your custom T-shirt today.",
            callToAction: "Order your custom T-shirt today.",
          },
          factcheck: { pass: true },
          qa: { pass: true },
        },
      },
    ],
    ...overrides,
  };
}

test("hydrates Creative from the authoritative approved run", () => {
  const result = buildApprovedCampaignHandoff(campaign());
  assert.equal(result.campaignId, "campaign-1");
  assert.equal(result.draft.productName, "tshirt");
  assert.equal(result.draft.targetAudience, "Local customers");
  assert.equal(result.draft.platform, "instagram");
  assert.equal(result.draft.duration, "30s");
  assert.equal(result.draft.productImageUrl, "/api/storage/objects/uploads/shirt");
  assert.match(result.draft.description, /Premium custom T-shirt/);
});

test("preserves the approved final script exactly", () => {
  const result = buildApprovedCampaignHandoff(campaign());
  const approved = (campaign().runs as any[])[1].final_result.finalScript.script;
  assert.equal(result.draft.expandedScript.script, approved);
  assert.equal(result.draft.expandedScript.voiceoverText, approved);
  assert.equal(result.draft.expandedScript.callToAction, "Order your custom T-shirt today.");
  assert.ok(result.draft.expandedScript.scenes.every((scene) => !scene.visualDirection.includes("starting at")));
});

test("rejects an unapproved campaign", () => {
  assert.throws(
    () => buildApprovedCampaignHandoff(campaign({ status: "draft" })),
    /not been approved/,
  );
});

test("rejects a missing or invalid approved run", () => {
  assert.throws(
    () => buildApprovedCampaignHandoff(campaign({ approved_run_id: "missing" })),
    /could not be verified/,
  );
});

test("rejects approved data that failed Fact Check or QA", () => {
  const value = campaign();
  (value.runs as any[])[1].final_result.qa.pass = false;
  assert.throws(
    () => buildApprovedCampaignHandoff(value),
    /required quality checks/,
  );
});
