import { createHash } from "node:crypto";
import {
  campaignGenerationContext,
  ownedWebsiteImportMatchesCampaign,
} from "./campaignContext";

export const REBUILD_EXPLANATION =
  "This campaign was created from older or mismatched business information. Rebuild it from your current Quae.ai information before approval.";
export const SOURCE_REPAIR_EXPLANATION =
  "This saved draft uses older campaign information. Quae can repair it against your current confirmed information without restarting the full campaign.";

export const CAMPAIGN_RECOVERY_REVISION = "owned-context-v4";
const CURRENT_RECOVERY_PREFIX = `failed-recovery:${CAMPAIGN_RECOVERY_REVISION}:`;
const TERMINAL_QUALITY_REBUILD_PREFIX = "terminal-quality-rebuild:v1:";

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const unsafe = (value: string) =>
  /^[\[{]/.test(value) ||
  /evidence[_ ]?ids?|model reasoning|chain of thought|hidden instructions?|parsing error|malformed output|as an ai|internal metadata/i.test(
    value,
  );
const safeReasons = (value: unknown, limit = 20) =>
  (Array.isArray(value) ? value : [])
    .map(text)
    .filter((item) => item && !unsafe(item))
    .slice(0, limit);
const canonical = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : value && typeof value === "object"
      ? `{${Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
          .join(",")}}`
      : JSON.stringify(value);

export function publicCampaignResult(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as any,
    final = input.finalScript;
  if (!final || typeof final !== "object" || Array.isArray(final)) return null;
  const projected = {
    strategy:
      input.strategy &&
      typeof input.strategy === "object" &&
      !Array.isArray(input.strategy)
        ? {
            angle: text(input.strategy.angle),
            audience: text(input.strategy.audience),
            positioning: text(input.strategy.positioning),
          }
        : null,
    hooks: {
      hooks: Array.isArray(input.hooks?.hooks)
        ? input.hooks.hooks
            .map((hook: any) => ({ text: text(hook?.text) }))
            .filter((hook: any) => hook.text)
            .slice(0, 5)
        : [],
    },
    winningScript:
      input.winningScript &&
      typeof input.winningScript === "object" &&
      !Array.isArray(input.winningScript)
        ? {
            title: text(input.winningScript.title),
            script: text(input.winningScript.script),
          }
        : null,
    finalScript: {
      title: text(final.title),
      hook: text(final.hook),
      script: text(final.script),
      callToAction: text(final.callToAction),
    },
    factcheck: {
      pass: input.factcheck?.pass === true,
      unsupportedClaims: safeReasons(input.factcheck?.unsupportedClaims),
      conciseReasons: safeReasons(input.factcheck?.conciseReasons),
    },
    qa: {
      pass: input.qa?.pass === true,
      score:
        typeof input.qa?.score === "number" && Number.isFinite(input.qa.score)
          ? Math.max(0, Math.min(100, input.qa.score))
          : null,
      issues: safeReasons(input.qa?.issues),
      customerSummary:
        text(input.qa?.customerSummary) &&
        !unsafe(text(input.qa.customerSummary))
          ? text(input.qa.customerSummary)
          : "",
    },
  };
  const customerText = [
    projected.strategy?.angle,
    projected.strategy?.audience,
    projected.strategy?.positioning,
    ...projected.hooks.hooks.map((hook: any) => hook.text),
    projected.winningScript?.title,
    projected.winningScript?.script,
    ...Object.values(projected.finalScript),
    ...projected.factcheck.unsupportedClaims,
    ...projected.factcheck.conciseReasons,
    ...projected.qa.issues,
    projected.qa.customerSummary,
  ].filter((item): item is string => Boolean(item));
  if (customerText.some(unsafe)) return null;
  return Object.values(projected.finalScript).some(Boolean) ? projected : null;
}

export function isLegacyCompletedQualityReview(run: any) {
  return Boolean(
    run?.status === "failed" &&
      run?.current_stage === "quality_review_failed" &&
      run?.failure_code == null &&
      Number(run?.retry_count ?? 0) === 0 &&
      typeof run?.idempotency_key === "string" &&
      run.idempotency_key.startsWith(CURRENT_RECOVERY_PREFIX),
  );
}

export function isCompletedQualityReviewDraft(run: any) {
  return Boolean(
    isLegacyCompletedQualityReview(run) &&
      publicCampaignResult(run?.final_result) !== null,
  );
}

export function terminalQualityRebuildIdempotencyKey(
  campaign: any,
  run: any,
) {
  return `${TERMINAL_QUALITY_REBUILD_PREFIX}${run.id}:${rebuildIdempotencyKey(campaign)}`;
}

export function isTerminalQualityRebuildRun(run: any) {
  return Boolean(
    typeof run?.idempotency_key === "string" &&
      run.idempotency_key.startsWith(TERMINAL_QUALITY_REBUILD_PREFIX),
  );
}

export function validateRunSource(campaign: any, run: any) {
  const expected = campaignGenerationContext(campaign);
  const actual = run?.context_snapshot;
  const owned = Boolean(
    campaign?.business_id && campaign.business_owner_id === campaign.user_id,
  );
  const imported =
    !campaign.website_import_id ||
    (ownedWebsiteImportMatchesCampaign(campaign) &&
      canonical(campaign.import_content) ===
        canonical(expected.websiteEvidence));
  const sourceMatches =
    !campaign.website_import_id ||
    (actual &&
      canonical({
        identity: actual.identity,
        products: actual.products,
        audienceEvidence: actual.audienceEvidence,
        offerEvidence: actual.offerEvidence,
        ctaEvidence: actual.ctaEvidence,
        sourceUrl: actual.sourceUrl,
        websiteEvidence: actual.websiteEvidence,
      }) ===
        canonical({
          identity: expected.identity,
          products: expected.products,
          audienceEvidence: expected.audienceEvidence,
          offerEvidence: expected.offerEvidence,
          ctaEvidence: expected.ctaEvidence,
          sourceUrl: expected.sourceUrl,
          websiteEvidence: expected.websiteEvidence,
        }));
  const outputValid =
    !run?.final_result || publicCampaignResult(run.final_result) !== null;
  const reason = !owned
    ? ("ownership_mismatch" as const)
    : !imported
      ? ("import_mismatch" as const)
      : !outputValid
        ? ("output_invalid" as const)
        : !sourceMatches
          ? ("source_mismatch" as const)
          : null;
  return {
    valid: reason === null,
    reason,
    repairable: Boolean(
      reason === "source_mismatch" &&
        outputValid &&
        (["ready_for_review", "needs_revision"].includes(run?.status) ||
          isCompletedQualityReviewDraft(run)),
    ),
  };
}

export function repairableRunBehindFailures(campaign: any, runs: any[]) {
  for (const run of runs) {
    const validation = validateRunSource(campaign, run);
    const hasSafeDraft = publicCampaignResult(run?.final_result) !== null;
    if (
      hasSafeDraft &&
      (["ready_for_review", "needs_revision"].includes(run?.status) ||
        isCompletedQualityReviewDraft(run)) &&
      (validation.valid || validation.repairable)
    )
      return run;
    if (run?.status !== "failed") return null;
  }
  return null;
}

export function rebuildIdempotencyKey(campaign: any) {
  return `source-rebuild:${createHash("sha256")
    .update(
      canonical({
        businessId: campaign.business_id,
        websiteImportId: campaign.website_import_id,
        context: campaign.context_snapshot,
        brief: campaign.brief,
      }),
    )
    .digest("hex")}`;
}

export function recoveryIdempotencyKey(campaign: any, run: any) {
  return run?.status === "failed"
    ? `${CURRENT_RECOVERY_PREFIX}${run.id}:${rebuildIdempotencyKey(campaign)}`
    : rebuildIdempotencyKey(campaign);
}

export function canRecoverCampaignRun(campaign: any, run: any) {
  return Boolean(
    run && (run.status === "failed" || !validateRunSource(campaign, run).valid),
  );
}

export function isFailedRecoveryRun(run: any) {
  return (
    typeof run?.idempotency_key === "string" &&
    run.idempotency_key.startsWith("failed-recovery:")
  );
}

export function isCurrentRecoveryRun(run: any) {
  return (
    typeof run?.idempotency_key === "string" &&
    run.idempotency_key.startsWith(CURRENT_RECOVERY_PREFIX)
  );
}

export function publicCampaignRun(run: any, valid: boolean) {
  return {
    id: run.id,
    run_number: run.run_number,
    status: valid ? run.status : "needs_rebuild",
    current_stage: run.current_stage,
    queued_at: run.queued_at,
    completed_at: run.completed_at,
    final_result: valid ? publicCampaignResult(run.final_result) : null,
    qa_status: valid ? run.qa_status : null,
  };
}
