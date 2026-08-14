import type { ExpandedScript } from "@workspace/api-client-react";

export const STUDIO_DRAFT_KEY = "quae_studio_draft";
export const CAMPAIGN_HANDOFF_SOURCE_KEY = "quae_campaign_handoff_source";

export type CampaignStudioDraft = {
  step: number;
  modelId: string;
  voiceId: string;
  productName: string;
  description: string;
  targetAudience: string;
  platform: string;
  duration: string;
  productImageUrl: string | null;
  productImageFileName: string | null;
  expandedScript: ExpandedScript;
};

export type ApprovedCampaignHandoff = {
  campaignId: string;
  campaignName: string;
  draft: CampaignStudioDraft;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePlatform(value: unknown): string {
  const raw = clean(value).toLowerCase();
  if (raw.includes("instagram")) return "instagram";
  if (raw.includes("youtube")) return "youtube";
  if (raw.includes("amazon")) return "amazon";
  return "tiktok";
}

function normalizeDuration(value: unknown): string {
  const raw = clean(value).toLowerCase();
  const seconds = raw.match(/(\d+)\s*(?:seconds?|sec|s)\b/);
  if (seconds) return `${seconds[1]}s`;
  const minutes = raw.match(/(\d+)\s*(?:minutes?|min|m)\b/);
  if (minutes) return `${Number(minutes[1]) * 60}s`;
  if (/^\d+s$/.test(raw)) return raw;
  return "10s";
}

function durationSeconds(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(clean).filter(Boolean);
}

function buildDescription(context: any, objective: unknown): string {
  const product = context?.product;
  const business = context?.business;
  const parts = [
    clean(product?.description),
    ...textList(product?.benefits),
    ...textList(product?.features),
    clean(product?.customerProblem),
  ].filter(Boolean);
  if (parts.length) return Array.from(new Set(parts)).join("\n");
  return clean(business?.description) || clean(objective) || clean(business?.name);
}

function approvedSegments(script: string, hook: string, cta: string): string[] {
  const lines = script
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== hook && line !== cta);
  const source = [hook, ...lines, cta].filter(Boolean);
  return Array.from(new Set(source)).slice(0, 6);
}

function buildScenes(script: string, hook: string, cta: string, duration: string) {
  const segments = approvedSegments(script, hook, cta);
  const safeSegments = segments.length ? segments : [script];
  const totalSeconds = durationSeconds(duration);
  const sceneSeconds = Math.max(1, Math.floor(totalSeconds / safeSegments.length));
  return safeSegments.map((description, index) => ({
    sceneNumber: index + 1,
    description,
    duration: `${sceneSeconds}s`,
    visualDirection:
      "Create visuals that support only this approved campaign line. Do not add product claims, price modifiers, discounts, guarantees, scarcity, availability, or performance claims that are not present in the approved copy.",
  }));
}

export function buildApprovedCampaignHandoff(campaign: any): ApprovedCampaignHandoff {
  if (!campaign || campaign.status !== "approved") {
    throw new Error("This campaign has not been approved for Creative Studio.");
  }
  const approvedRunId = clean(campaign.approved_run_id);
  if (!approvedRunId) throw new Error("This campaign does not have an approved version.");
  const runs = Array.isArray(campaign.runs) ? campaign.runs : [];
  const run = runs.find((candidate: any) => candidate?.id === approvedRunId);
  if (!run || run.status !== "ready_for_review") {
    throw new Error("The approved campaign version could not be verified.");
  }
  const result = run.final_result;
  if (!result?.factcheck?.pass || !result?.qa?.pass) {
    throw new Error("The approved campaign did not pass the required quality checks.");
  }
  const finalScript = result.finalScript;
  const script = clean(finalScript?.script);
  const hook = clean(finalScript?.hook);
  const cta = clean(finalScript?.callToAction);
  if (!script || !hook || !cta) {
    throw new Error("The approved campaign is missing production-ready copy.");
  }

  const context = run.context_snapshot ?? {};
  const product = context.product;
  const business = context.business;
  const brief = campaign.brief ?? context.campaignBrief ?? {};
  const duration = normalizeDuration(brief.duration);
  const productName = clean(product?.name) || clean(campaign.name) || clean(business?.name);
  const targetAudience =
    clean(product?.targetAudience) ||
    clean(result.strategy?.audience) ||
    clean(business?.targetAudience);
  const description = buildDescription(context, brief.objective);
  const primaryImage = clean(product?.primaryImage);

  const expandedScript: ExpandedScript = {
    script,
    hook,
    callToAction: cta,
    voiceoverText: script,
    scenes: buildScenes(script, hook, cta, duration),
    suggestedMusic: null,
    estimatedDuration: duration,
  };

  return {
    campaignId: clean(campaign.id),
    campaignName: clean(campaign.name) || productName,
    draft: {
      step: 2,
      modelId: "ltx-fast",
      voiceId: "alloy",
      productName,
      description,
      targetAudience,
      platform: normalizePlatform(brief.channel),
      duration,
      productImageUrl: primaryImage ? `/api/storage${primaryImage}` : null,
      productImageFileName: primaryImage ? "Approved product reference" : null,
      expandedScript,
    },
  };
}
