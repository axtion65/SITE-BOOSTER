import type { ExpandedScript } from "./falvideo";

export const VIDEO_RENDER_BRIEF_VERSION = "model-aware-v1";

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
}

export function parseVideoDuration(value: string): number {
  const normalized = value.toLowerCase().trim();
  const amount = Number.parseFloat(normalized) || 10;
  return normalized.endsWith("m") ? amount * 60 : amount;
}

function sentences(value: string): string[] {
  return value.split(/(?<=[.!?])\s+|\n+/).map(part => part.trim()).filter(Boolean);
}

function selectApprovedMessage(script: ExpandedScript, maxWords: number): string {
  const candidates = [script.callToAction, script.hook, ...sentences(script.voiceoverText), ...sentences(script.script)]
    .map(value => value?.trim()).filter((value): value is string => Boolean(value));
  const priced = candidates.find(value => /(?:[$€£]\s?\d|\b\d+(?:\.\d{1,2})?\s?(?:dollars?|euros?|pounds?)\b)/i.test(value) && value.split(/\s+/).length <= maxWords);
  return priced ?? candidates.find(value => value.split(/\s+/).length <= maxWords) ?? candidates[0] ?? "";
}

function durationSafeApprovedExcerpt(value: string, maxWords: number): string {
  const candidate = sentences(value).find(line => line.split(/\s+/).length <= maxWords);
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
  };
}
