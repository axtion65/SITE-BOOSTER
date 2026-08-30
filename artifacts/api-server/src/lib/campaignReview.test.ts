import assert from "node:assert/strict";
import test from "node:test";
import {
  campaignGenerationContext,
  missingCampaignEvidence,
  missingGenerationEvidence,
  workspaceMissingCampaignEvidence,
} from "./campaignContext";
import {
  publicCampaignResult,
  rebuildIdempotencyKey,
  canRecoverCampaignRun,
  isCurrentRecoveryRun,
  isFailedRecoveryRun,
  recoveryIdempotencyKey,
  repairableRunBehindFailures,
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
    "source_mismatch",
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
    idempotency_key: `failed-recovery:research-input-v3:failed-run:${rebuildIdempotencyKey(campaign)}`,
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
test("legacy campaign recovery reconstructs the owned approved website context", () => {
  const importContent = {
    business: {
      name: "Quae.ai",
      website: "https://quae.ai",
      description: "AI marketing software",
    },
    products: [
      {
        name: "Campaign software",
        description: "Build grounded campaigns",
        regularPrice: null,
        offer: "Campaign planning",
        selected: true,
      },
    ],
  };
  const legacyCampaign = {
    ...campaign,
    context_snapshot: {},
    import_business_id: null,
    import_approved_campaign_id: campaign.id,
    import_content: importContent,
    identity_resolution: "imported",
    business_name: "Quae.ai",
    business_website: "https://quae.ai",
    business_description: "AI marketing software",
    business_target_customer: "Small businesses",
    business_products_services: "Campaign software",
    business_primary_cta: "Start now",
  };

  const rebuilt = campaignGenerationContext(legacyCampaign);
  assert.equal(rebuilt.identity.name, "Quae.ai");
  assert.equal(rebuilt.products[0].name, "Campaign software");
  assert.equal(rebuilt.audienceEvidence, "Small businesses");
  assert.equal(rebuilt.offerEvidence, "Campaign planning");
  assert.equal(rebuilt.ctaEvidence, "Start now");
  assert.deepEqual(rebuilt.websiteEvidence, importContent);
  assert.deepEqual(missingGenerationEvidence(rebuilt), []);
  assert.equal(
    validateRunSource(legacyCampaign, {
      context_snapshot: structuredClone(rebuilt),
    }).valid,
    true,
  );
});

test("legacy campaign without an import rebuilds from its owned business", () => {
  const legacyCampaign = {
    ...campaign,
    website_import_id: null,
    import_id: null,
    import_content: null,
    context_snapshot: {},
    business_name: "Quae.ai",
    business_website: "https://quae.ai",
    business_description: "AI marketing software",
    business_target_customer: "Small businesses",
    business_products_services: "Campaign software",
    business_primary_cta: "Start now",
  };

  const rebuilt = campaignGenerationContext(legacyCampaign);
  assert.equal(rebuilt.identity.name, "Quae.ai");
  assert.equal(rebuilt.products[0].name, "Campaign software");
  assert.equal(rebuilt.audienceEvidence, "Small businesses");
  assert.equal(rebuilt.ctaEvidence, "Start now");
  assert.deepEqual(missingGenerationEvidence(rebuilt), []);
  const failed = {
    id: "failed-empty-context",
    status: "failed",
    context_snapshot: { campaignBrief: campaign.brief },
  };
  const retryKey = recoveryIdempotencyKey(legacyCampaign, failed);
  assert.match(retryKey, /^failed-recovery:owned-context-v4:/);
  assert.notEqual(retryKey, rebuildIdempotencyKey(legacyCampaign));
});

test("incomplete legacy campaign exposes the missing details for rescue", () => {
  const incomplete = {
    ...campaign,
    website_import_id: null,
    import_id: null,
    import_content: null,
    context_snapshot: { campaignBrief: campaign.brief },
    business_name: "Quae.ai",
    business_target_customer: "Small businesses",
    business_products_services: "Campaign software",
    business_primary_cta: null,
  };

  assert.deepEqual(missingCampaignEvidence(incomplete), []);
  assert.deepEqual(
    workspaceMissingCampaignEvidence(incomplete, { status: "failed" }),
    ["cta"],
  );
});

test("legacy recovery does not use a mismatched website import", () => {
  const mismatched = {
    ...campaign,
    context_snapshot: {},
    import_user_id: "different-owner",
    import_content: {
      business: { name: "Wrong business" },
      products: [{ name: "Wrong product", selected: true }],
    },
  };
  const rebuilt = campaignGenerationContext(mismatched);
  assert.equal(rebuilt.websiteEvidence, null);
  assert.equal(
    validateRunSource(mismatched, { context_snapshot: rebuilt }).valid,
    false,
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

test("customer projection includes safe quality feedback without internal evidence data", () => {
  const result = publicCampaignResult({
    ...final(),
    factcheck: {
      pass: false,
      unsupportedClaims: [
        "Remove the unsupported affordability claim.",
        "evidenceIds: fact_001",
      ],
      conciseReasons: ["Affordability was not confirmed."],
    },
    qa: {
      pass: false,
      score: 68,
      issues: ["Use only the confirmed service list."],
      customerSummary: "One unsupported modifier still needs revision.",
    },
  });
  assert.deepEqual(result?.factcheck.unsupportedClaims, [
    "Remove the unsupported affordability claim.",
  ]);
  assert.deepEqual(result?.factcheck.conciseReasons, [
    "Affordability was not confirmed.",
  ]);
  assert.equal(result?.qa.score, 68);
  assert.deepEqual(result?.qa.issues, [
    "Use only the confirmed service list.",
  ]);
  assert.doesNotMatch(JSON.stringify(result), /fact_001|evidenceIds/);
});

test("owned needs-revision output with stale source is eligible for focused repair", () => {
  const stale = {
    id: "stale-run",
    status: "needs_revision",
    context_snapshot: {
      ...correctContext,
      audienceEvidence: "An older audience",
    },
    final_result: final(),
  };
  const validation = validateRunSource(campaign, stale);
  assert.equal(validation.reason, "source_mismatch");
  assert.equal(validation.repairable, true);
});

test("focused repair may recover the newest safe draft behind failed attempts", () => {
  const safeDraft = {
    id: "safe-draft",
    status: "needs_revision",
    context_snapshot: {
      ...correctContext,
      audienceEvidence: "An older audience",
    },
    final_result: final(),
  };
  assert.equal(
    repairableRunBehindFailures(campaign, [
      { id: "failed-2", status: "failed" },
      { id: "failed-1", status: "failed" },
      safeDraft,
    ])?.id,
    "safe-draft",
  );
});

test("a newer nonfailed run blocks recovery of an older draft", () => {
  const staleDraft = {
    id: "stale-draft",
    status: "needs_revision",
    context_snapshot: {
      ...correctContext,
      audienceEvidence: "An older audience",
    },
    final_result: final(),
  };
  assert.equal(
    repairableRunBehindFailures(campaign, [
      { id: "newer", status: "queued" },
      staleDraft,
    ]),
    null,
  );
});

test("ownership, import, and unsafe-output failures cannot enter focused repair", () => {
  const run = {
    status: "needs_revision",
    context_snapshot: correctContext,
    final_result: final(),
  };
  assert.deepEqual(
    validateRunSource({ ...campaign, business_owner_id: "other" }, run),
    { valid: false, reason: "ownership_mismatch", repairable: false },
  );
  assert.equal(
    validateRunSource({ ...campaign, import_user_id: "other" }, run).reason,
    "import_mismatch",
  );
  assert.equal(
    validateRunSource(
      campaign,
      {
        ...run,
        final_result: {
          finalScript: { script: '{"evidenceIds":["fact_1"]}' },
        },
      },
    ).reason,
    "output_invalid",
  );
});
