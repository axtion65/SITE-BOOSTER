import assert from "node:assert/strict";
import test from "node:test";
import {
  publicCampaignResult,
  rebuildIdempotencyKey,
  canRecoverCampaignRun,
  isCurrentRecoveryRun,
  isFailedRecoveryRun,
  recoveryIdempotencyKey,
  validateRunSource,
} from "./campaignReview";

const context = {
  source: "website_import",
  sourceUrl: "https://quae.ai",
  websiteSnapshot: { business: { name: "Quae.ai" } },
  generationContext: {
    identity: { name: "Quae.ai" },
    products: [{ name: "AI campaign software" }],
    audienceEvidence: "Small businesses",
    offerEvidence: "Campaign planning",
    ctaEvidence: "Start now",
  },
};
const campaign = {
  id: "campaign-quae",
  user_id: "owner",
  business_id: "quae-business",
  business_owner_id: "owner",
  website_import_id: "quae-import",
  import_id: "quae-import",
  import_user_id: "owner",
  import_business_id: "quae-business",
  source_url: "https://quae.ai",
  import_source_url: "https://quae.ai",
  import_content: context.websiteSnapshot,
  context_snapshot: context,
  brief: { objective: "Explain Quae.ai" },
};
const correctContext = {
  ...context.generationContext,
  websiteEvidence: context.websiteSnapshot,
  sourceUrl: context.sourceUrl,
  campaignBrief: campaign.brief,
};
const final = (name = "Quae.ai") => ({
  finalScript: {
    title: `Meet ${name}`,
    hook: "Plan with confidence",
    script: `${name} helps small businesses build campaigns.`,
    callToAction: "Start now",
  },
  factcheck: { pass: true },
  qa: { pass: true },
});

test("the Quae.ai campaign quarantines the preserved Big Al's run", () => {
  const contaminated = {
    id: "legacy",
    context_snapshot: { ...correctContext, identity: { name: "Big Al's" } },
    final_result: final("Big Al's"),
  };
  assert.equal(
    validateRunSource(campaign, contaminated).reason,
    "needs_rebuild",
  );
  assert.equal(contaminated.final_result.finalScript.title, "Meet Big Al's");
});
test("a corrected run uses the exact owned import snapshot and remains valid after reload", () =>
  assert.equal(
    validateRunSource(
      { ...campaign },
      {
        context_snapshot: structuredClone(correctContext),
        final_result: final(),
      },
    ).valid,
    true,
  ));
test("rebuild retries have one stable source-derived key", () =>
  assert.equal(
    rebuildIdempotencyKey(campaign),
    rebuildIdempotencyKey(structuredClone(campaign)),
  ));
test("one failed run receives one stable recovery identity", () => {
  const failed = {
    id: "failed-run",
    status: "failed",
    context_snapshot: correctContext,
  };
  assert.equal(canRecoverCampaignRun(campaign, failed), true);
  assert.equal(
    recoveryIdempotencyKey(campaign, failed),
    recoveryIdempotencyKey(structuredClone(campaign), structuredClone(failed)),
  );
  assert.notEqual(
    recoveryIdempotencyKey(campaign, failed),
    rebuildIdempotencyKey(campaign),
  );
  const retry = {
    idempotency_key: recoveryIdempotencyKey(campaign, failed),
  };
  assert.equal(isFailedRecoveryRun(retry), true);
  assert.equal(isCurrentRecoveryRun(retry), true);
});
test("one legacy failed recovery receives one current-revision retry identity", () => {
  const legacyRecovery = {
    id: "legacy-recovery",
    status: "failed",
    context_snapshot: correctContext,
    idempotency_key: `failed-recovery:failed-run:${rebuildIdempotencyKey(campaign)}`,
  };
  assert.equal(isFailedRecoveryRun(legacyRecovery), true);
  assert.equal(isCurrentRecoveryRun(legacyRecovery), false);
  assert.equal(
    isCurrentRecoveryRun({
      idempotency_key: recoveryIdempotencyKey(campaign, legacyRecovery),
    }),
    true,
  );
});
test("customer projection fails closed for JSON and AI internal text", () => {
  assert.equal(
    publicCampaignResult({
      finalScript: { script: '{"evidenceIds":["fact_1"]}' },
    }),
    null,
  );
  assert.equal(
    publicCampaignResult({
      finalScript: { script: "Model reasoning: use hidden instructions" },
    }),
    null,
  );
  assert.doesNotMatch(
    JSON.stringify(
      publicCampaignResult({
        ...final(),
        evidenceIds: ["fact_1"],
        rationale: "secret",
      }),
    ),
    /fact_1|secret/,
  );
});
