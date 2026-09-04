import type { ExpandedScript } from "@workspace/api-client-react";

export interface ApprovedCampaignHandoff {
  campaignId: string;
  campaignName: string;
  productName: string;
  description: string;
  targetAudience: string;
  platform: string;
  duration: string;
  approvedCta: string;
  expandedScript: ExpandedScript;
}

export function shouldRestoreStudioDraft(search: string): boolean {
  const params = new URLSearchParams(search);
  const hasTemplate = !!(
    params.get("templateName") ||
    params.get("templateId") ||
    params.get("platform")
  );
  return !params.get("campaignId")?.trim() && !hasTemplate;
}

export function campaignVideoIdempotencyKey(input:{campaignId:string|null;approvedRunId:string;briefId:string|null;renderIntent:"create_new"|"animate";modelId:string;duration:string;attemptId:string}):string|null{
  if(!input.campaignId||!input.approvedRunId)return null;
  return `campaign-video:${input.approvedRunId}:${input.renderIntent}:${input.briefId||"approved-copy"}:${input.modelId}:${input.duration}:${input.attemptId}`;
}

type CampaignRecord = Record<string, any>;

const SUPPORTED_PLATFORMS = ["tiktok", "instagram", "youtube", "amazon"];

function platformFor(channel: unknown): string {
  const value = String(channel ?? "").toLowerCase();
  if (value.includes("instagram")) return "instagram";
  if (value.includes("youtube")) return "youtube";
  if (value.includes("amazon")) return "amazon";
  if (value.includes("tik") || value.includes("social")) return "tiktok";
  return SUPPORTED_PLATFORMS.includes(value) ? value : "tiktok";
}

function durationFor(value: unknown): string {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (/^\d+s$/.test(raw)) return raw;
  const seconds = raw.match(/\d+/)?.[0];
  return seconds ? `${seconds}s` : "15s";
}

function conciseDirectorContext(value: unknown, fallback: string): string {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return (normalized || fallback).slice(0, 280);
}

function productionScenes(
  script: string,
  duration: string,
  context: { productName?: unknown; productDescription?: unknown; targetAudience?: unknown } = {},
): ExpandedScript["scenes"] {
  const sentences = script
    .trim()
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const sceneCount = Math.max(1, Math.min(4, sentences.length));
  const groups = Array.from({ length: sceneCount }, () => [] as string[]);
  sentences.forEach((sentence, index) =>
    groups[
      Math.min(
        sceneCount - 1,
        Math.floor((index * sceneCount) / sentences.length),
      )
    ].push(sentence),
  );
  const totalSeconds = Number.parseInt(duration, 10) || 15;
  const subject = conciseDirectorContext(context.productName, "the approved product or service");
  const audience = conciseDirectorContext(context.targetAudience, "the intended customer");
  const productContext = conciseDirectorContext(context.productDescription, "Use only the product or service details supported by the spoken beat.");
  return groups.map((copy, index) => ({
    sceneNumber: index + 1,
    description: copy.join(" "),
    duration: `${Math.max(1, Math.round(totalSeconds / sceneCount))}s`,
    visualDirection: index === 0
      ? `Director beat — Hook: show ${audience} in a believable situation that visually expresses this spoken beat. Establish ${subject} as the consistent subject with one immediate action and purposeful close or medium framing. No invented claims or generated text.`
      : index === sceneCount - 1
        ? `Director beat — Payoff: show ${audience} experiencing the clear outcome of ${subject}, limited to this spoken beat. Finish on a premium product or service hero composition with clean space for Quae's deterministic CTA. Do not generate the CTA or any text.`
        : index === 1
          ? `Director beat — Demonstration: show ${subject} through one concrete action that directly matches this spoken beat. Approved product context: ${productContext} Keep the same product, environment, and visual identity; no unrelated objects, industries, or claims.`
          : `Director beat — Proof: show a believable result of ${subject} for ${audience}, limited to this spoken beat and approved product context. Use one purposeful detail or reaction shot while preserving continuity and product identity.`,
  }));
}

/** Converts an owned, server-approved campaign into production data without an AI rewrite. */
export function approvedCampaignToStudio(
  campaign: CampaignRecord,
): ApprovedCampaignHandoff | null {
  if (campaign.status !== "approved" || !campaign.approved_run_id) return null;
  const approvedRun = campaign.runs?.find(
    (run: CampaignRecord) => run.id === campaign.approved_run_id,
  );
  if (!approvedRun || approvedRun.status !== "ready_for_review") return null;

  const result = approvedRun.final_result;
  const finalScript = result?.finalScript;
  const script = String(finalScript?.script ?? "").trim();
  if (!script || result?.factcheck?.pass !== true || result?.qa?.pass !== true)
    return null;

  const context = approvedRun.context_snapshot ?? {};
  const product = context.product ?? {};
  const business = context.business ?? {};
  const brief = context.campaignBrief ?? campaign.brief ?? {};
  const cta = String(
    finalScript.callToAction ?? product.cta ?? business.cta ?? "",
  ).trim();
  const productName = String(
    product.name ?? business.name ?? campaign.name,
  ).trim();
  const descriptionParts = [
    product.description,
    Array.isArray(product.benefits)
      ? product.benefits.join(", ")
      : product.benefits,
    product.offer,
    business.description,
  ].filter(Boolean);
  const duration = durationFor(brief.duration);

  return {
    campaignId: String(campaign.id),
    campaignName: String(campaign.name),
    productName,
    description:
      descriptionParts.join("\n\n") || String(brief.objective ?? campaign.name),
    targetAudience: String(
      product.targetAudience ??
        business.targetAudience ??
        result.strategy?.audience ??
        "",
    ),
    platform: platformFor(brief.channel),
    duration,
    approvedCta: cta,
    expandedScript: {
      script,
      hook: String(finalScript.hook ?? "").trim(),
      callToAction: cta,
      voiceoverText: script,
      scenes: productionScenes(script, duration, {
        productName,
        productDescription: descriptionParts.join("\n\n"),
        targetAudience:
          product.targetAudience ??
          business.targetAudience ??
          result.strategy?.audience,
      }),
      estimatedDuration: duration,
      suggestedMusic: null,
    },
  };
}


export interface PreparedVideoBriefExpectation {
  briefId: string;
  campaignId: string;
  approvedRunId: string;
  selectedVisualProjectId: string;
  selectedVisualVersionId: string;
}

/** Converts only the exact, server-prepared campaign brief into Creative state. */
export function preparedVideoBriefToStudio(
  record: CampaignRecord,
  expected: PreparedVideoBriefExpectation,
): ApprovedCampaignHandoff | null {
  const brief = record?.brief;
  if (!brief || typeof brief !== "object") return null;
  const exactIdentity =
    String(record.id) === expected.briefId &&
    String(record.campaign_id) === expected.campaignId &&
    String(record.campaign_run_id) === expected.approvedRunId &&
    String(record.mockup_project_id) === expected.selectedVisualProjectId &&
    String(record.mockup_version_id) === expected.selectedVisualVersionId &&
    String(brief.campaignId) === expected.campaignId &&
    String(brief.approvedCampaignRunId) === expected.approvedRunId &&
    String(brief.selectedVisualProjectId) === expected.selectedVisualProjectId &&
    String(brief.selectedVisualVersionId) === expected.selectedVisualVersionId &&
    record.render_intent === "animate" &&
    brief.renderIntent === "animate";
  if (!exactIdentity) return null;
  const script = typeof brief.approvedCopy === "string" ? brief.approvedCopy.trim() : "";
  if (!script) return null;
  const duration = durationFor(brief.duration);
  const cta = String(brief.cta ?? "").trim();
  const descriptionParts = [brief.productDescription,brief.offer,typeof brief.strategy === "string" ? brief.strategy : null].filter(Boolean);
  return {
    campaignId: expected.campaignId,
    campaignName: String(brief.campaignName ?? "").trim(),
    productName: String(brief.productName ?? brief.campaignName ?? "").trim(),
    description: descriptionParts.join("\n\n") || String(brief.campaignName ?? "").trim(),
    targetAudience: String(brief.targetAudience ?? "").trim(),
    platform: platformFor(brief.platform),
    duration,
    approvedCta: cta,
    expandedScript: {script,hook:String(brief.hook ?? "").trim(),callToAction:cta,voiceoverText:script,scenes:productionScenes(script,duration,{productName:brief.productName ?? brief.campaignName,productDescription:brief.productDescription,targetAudience:brief.targetAudience}),estimatedDuration:duration,suggestedMusic:null},
  };
}
