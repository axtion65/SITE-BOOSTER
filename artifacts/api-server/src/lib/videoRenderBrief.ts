import type { ExpandedScript } from "./falvideo";
import { RENDERING_MODEL_BY_ID } from "@workspace/plans";
import { splitApprovedSentences } from "./sentenceSegmentation";

export const VIDEO_RENDER_BRIEF_VERSION = "model-aware-v2";

/** Authoritative native clip limits used for prompt compilation and provider params. */
export const MODEL_NATIVE_DURATION_SECONDS: Readonly<Record<string, number>> = Object.freeze({
  ltx: 5,
  "ltx-fast": 5,
  ovi: 10,
  wan: 10,
  kling: 10,
  "kling-1.6": 10,
  veo3: 8,
  "quae-v1": 10,
});

/** Kept beside the native-duration metadata so every render path uses one capability source. */
export const IMAGE_CONDITIONED_VIDEO_MODELS: ReadonlySet<string> = new Set([
  "ltx-fast", "wan", "kling", "kling-1.6",
]);

export function modelSupportsImageConditioning(modelId: string): boolean {
  return RENDERING_MODEL_BY_ID[modelId]?.supports.imageToVideo === true;
}

export interface VideoRenderBrief {
  version: typeof VIDEO_RENDER_BRIEF_VERSION;
  modelId: string;
  modelNativeDurationSeconds: number;
  approvedDurationSeconds: number;
  renderDurationSeconds: number;
  shortened: boolean;
  visualBeats: string[];
  marketingMessage: string;
  voiceoverText: string;
  visualTextPolicy: string;
  visualProductionBrief: string;
  captionStyle: CaptionStyle;
}

export interface CaptionStyle { color:string; backingColor:string; stroke:string; safeMarginPercent:number; maxLineCharacters:number }
export const READABLE_CAPTION_STYLE: Readonly<CaptionStyle> = Object.freeze({
  color: "#FFFFFF", backingColor: "rgba(0,0,0,0.78)", stroke: "2px #000000",
  safeMarginPercent: 8, maxLineCharacters: 42,
});

const TEXT_SAFETY = "No signs, posters, billboards, menus, screens displaying text, UI, captions, subtitles, invented labels, generated logos, random symbols, fake lettering, readable typography, watermarks, or background writing.";

function isApparelCampaign(script: ExpandedScript): boolean {
  const context = [script.hook, script.script, script.callToAction, script.voiceoverText,
    ...script.scenes.flatMap(scene => [scene.description, scene.visualDirection])].join(" ");
  return /\b(?:t-?shirts?|shirts?|apparel|garments?|hoodies?|sweatshirts?|clothing|wearable|fabric)\b/i.test(context);
}

function productionBrief(script: ExpandedScript, short: boolean): string {
  const shot = short
    ? "One continuous product-focused shot: show the product immediately, with one simple slow camera move or reveal and at most one natural person interaction. No montage, cuts, crowds, multiple locations, complex story, or end card."
    : "Keep the product clearly visible and recognizable as the focal subject throughout.";
  const apparel = isApparelCampaign(script)
    ? " Apparel fidelity: favor a clear front view, a fully visible garment surface, natural fabric and realistic construction. Preserve a supported custom print area from the supplied reference; never invent artwork, exact lettering, or a logo. The garment must not morph into another garment."
    : " Preserve the product's shape, materials, colors, and recognizable identity; do not morph it into another product.";
  return `Clean, uncluttered studio or neutral lifestyle setting. The product is the hero and focal subject. ${shot}${apparel} ${TEXT_SAFETY}`;
}

export function approvedCampaignPlatform(value: unknown): string {
  const platform = String(value ?? "").trim().toLowerCase();
  if (platform.includes("instagram")) return "instagram";
  if (platform.includes("youtube")) return "youtube";
  if (platform.includes("amazon")) return "amazon";
  if (platform.includes("tik") || platform.includes("social")) return "tiktok";
  return ["tiktok", "instagram", "youtube", "amazon"].includes(platform) ? platform : "tiktok";
}

function approvedCampaignDuration(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (/^\d+s$/.test(raw)) return raw;
  const seconds = raw.match(/\d+/)?.[0];
  return seconds ? `${seconds}s` : "15s";
}

function conciseDirectorContext(value: unknown, fallback: string): string {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return (normalized || fallback).slice(0, 280);
}

function approvedCampaignScenes(brief: Record<string, unknown>, script: string, duration: string): ExpandedScript["scenes"] {
  const sentences = splitApprovedSentences(script);
  const sceneCount = Math.max(1, Math.min(4, sentences.length));
  const groups = Array.from({ length: sceneCount }, () => [] as string[]);
  sentences.forEach((sentence, index) => {
    const groupIndex = Math.min(sceneCount - 1, Math.floor((index * sceneCount) / sentences.length));
    groups[groupIndex]!.push(sentence);
  });
  const totalSeconds = Number.parseInt(duration, 10) || 15;
  const subject = conciseDirectorContext(brief.productName ?? brief.campaignName, "the approved product or service");
  const audience = conciseDirectorContext(brief.targetAudience, "the intended customer");
  const productContext = conciseDirectorContext(brief.productDescription, "Use only the product or service details supported by the spoken beat.");
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

/** Rebuilds provider input from the persisted, approved campaign brief. */
export function approvedCampaignBriefToExpandedScript(value: unknown): ExpandedScript {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Approved campaign video brief is missing");
  }
  const brief = value as Record<string, unknown>;
  const script = String(brief.approvedCopy ?? "").trim();
  if (!script) throw new Error("Approved campaign copy is missing");
  const duration = approvedCampaignDuration(brief.duration);
  const cta = String(brief.cta ?? "").trim();
  return {
    script,
    hook: String(brief.hook ?? "").trim(),
    callToAction: cta,
    voiceoverText: script,
    scenes: approvedCampaignScenes(brief, script, duration),
    estimatedDuration: duration,
    suggestedMusic: "",
  };
}

export function parseVideoDuration(value: string): number {
  const normalized = value.toLowerCase().trim();
  const amount = Number.parseFloat(normalized) || 10;
  return normalized.endsWith("m") ? amount * 60 : amount;
}

function selectApprovedMessage(script: ExpandedScript, maxWords: number): string {
  const candidates = [script.callToAction, script.hook, ...splitApprovedSentences(script.voiceoverText), ...splitApprovedSentences(script.script)]
    .map(value => value?.trim()).filter((value): value is string => Boolean(value));
  const priced = candidates.find(value => /(?:[$€£]\s?\d|\b\d+(?:\.\d{1,2})?\s?(?:dollars?|euros?|pounds?)\b)/i.test(value) && value.split(/\s+/).length <= maxWords);
  return priced ?? candidates.find(value => value.split(/\s+/).length <= maxWords) ?? candidates[0] ?? "";
}

function durationSafeApprovedExcerpt(value: string, maxWords: number): string {
  const candidate = splitApprovedSentences(value).find(line => line.split(/\s+/).length <= maxWords);
  if (candidate) return candidate;
  // A word-boundary excerpt is selection, not generated copy. It cannot add claims or price modifiers.
  return value.trim().split(/\s+/).slice(0, maxWords).join(" ").replace(/[,;:]$/, "");
}

export function compileVideoRenderBrief(
  approvedScript: ExpandedScript,
  requestedDuration: string,
  modelId: string,
): VideoRenderBrief {
  const approvedDurationSeconds = parseVideoDuration(requestedDuration);
  const modelNativeDurationSeconds = MODEL_NATIVE_DURATION_SECONDS[modelId] ?? MODEL_NATIVE_DURATION_SECONDS.ovi;
  const renderDurationSeconds = Math.min(approvedDurationSeconds, modelNativeDurationSeconds);
  const shortened = modelNativeDurationSeconds < approvedDurationSeconds;
  const maxWords = Math.max(3, Math.floor(renderDurationSeconds * 2.4));

  if (!shortened) {
    return {
      version: VIDEO_RENDER_BRIEF_VERSION, modelId, modelNativeDurationSeconds,
      approvedDurationSeconds, renderDurationSeconds, shortened,
      visualBeats: approvedScript.scenes.map(scene => `${scene.description} ${scene.visualDirection}`.trim()),
      marketingMessage: approvedScript.callToAction || approvedScript.hook,
      voiceoverText: approvedScript.voiceoverText,
      visualTextPolicy: "Imagery only. Do not generate captions, prices, signs, UI, readable typography, logos, or brand lettering.",
      visualProductionBrief: productionBrief(approvedScript, renderDurationSeconds <= 5),
      captionStyle: READABLE_CAPTION_STYLE,
    };
  }

  const beatCount = renderDurationSeconds <= 5 ? 1 : 2;
  const visualBeats = approvedScript.scenes.slice(0, beatCount).map(scene =>
    `${scene.description} ${scene.visualDirection}`.trim(),
  );
  if (visualBeats.length === 0) visualBeats.push(approvedScript.hook || approvedScript.script);
  const marketingMessage = selectApprovedMessage(approvedScript, maxWords);
  const voiceSource = marketingMessage || approvedScript.voiceoverText || approvedScript.hook;

  return {
    version: VIDEO_RENDER_BRIEF_VERSION, modelId, modelNativeDurationSeconds,
    approvedDurationSeconds, renderDurationSeconds, shortened,
    visualBeats, marketingMessage,
    voiceoverText: durationSafeApprovedExcerpt(voiceSource, maxWords),
    visualTextPolicy: "Imagery only. Do not generate captions, prices, signs, UI, readable typography, logos, or brand lettering. Exact approved copy is reserved for deterministic overlays.",
    visualProductionBrief: productionBrief(approvedScript, renderDurationSeconds <= 5),
    captionStyle: READABLE_CAPTION_STYLE,
  };
}
