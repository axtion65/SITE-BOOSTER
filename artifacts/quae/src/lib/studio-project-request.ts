import type { ExpandedScript, ProjectInput } from "@workspace/api-client-react";
import { normalizeClipLength, RENDERING_MODEL_BY_ID, type RenderIntent } from "@workspace/plans";

export interface StudioProjectRequestInput {
  campaignId: string | null;
  campaignVideoBriefId: string | null;
  idempotencyKey: string;
  productName: string;
  description: string;
  modelId: string;
  expandedScript: ExpandedScript | null;
  platform: string;
  duration: string;
  templateId?: string;
  renderIntent: RenderIntent;
  productImageUrl: string | null;
  voiceId: string;
}

/** Builds the one project-save shape used by every selectable rendering model. */
export function buildStudioProjectRequest(input: StudioProjectRequestInput): ProjectInput {
  const model = RENDERING_MODEL_BY_ID[input.modelId];
  if (!model) throw new Error("Choose a supported rendering model.");
  if (!input.expandedScript) throw new Error("Complete the AI script before rendering.");

  const canAnimate = input.renderIntent === "animate" && model.supports.imageToVideo && Boolean(input.productImageUrl);
  const productImageUrl = canAnimate ? input.productImageUrl : null;
  const sourceAssetId = productImageUrl?.startsWith("/api/storage/")
    ? productImageUrl.slice("/api/storage".length)
    : null;
  if (canAnimate && !sourceAssetId) throw new Error("Upload the product image again before animating it.");

  return {
    campaignId: input.campaignId,
    campaignVideoBriefId: input.campaignVideoBriefId,
    confirmed: true,
    idempotencyKey: input.idempotencyKey,
    title: `${input.productName} Ad`,
    description: input.description,
    renderingModelId: input.modelId,
    expandedScript: JSON.stringify(input.expandedScript),
    platform: input.platform,
    duration: normalizeClipLength(input.modelId, input.duration),
    templateId: input.templateId ?? null,
    renderIntent: canAnimate ? "animate" : "create_new",
    sourceAssetId,
    productImageUrl,
    voiceId: input.voiceId || "alloy",
  };
}
