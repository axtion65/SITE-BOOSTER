import type { ExpandedScript } from "./falvideo";

export const VIDEO_PRODUCTION_VERSION = "bdb-scenes-v1" as const;
export const PRODUCTION_DURATIONS = [15, 30, 45] as const;
export type ProductionDuration = (typeof PRODUCTION_DURATIONS)[number];

export interface ProductionBrand {
  name: string;
  website?: string | null;
  logoObjectPath?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  callToAction: string;
}

export interface ProductionScenePlan {
  index: number;
  durationMs: number;
  narrationText: string;
  visualPrompt: string;
  sourceAssetPath: string | null;
}

export interface VideoProductionPlan {
  version: typeof VIDEO_PRODUCTION_VERSION;
  targetDurationSeconds: ProductionDuration;
  fps: 30;
  platform: string;
  width: number;
  height: number;
  voiceoverDurationMs: number;
  endCardDurationMs: 3000;
  brand: ProductionBrand;
  scenes: ProductionScenePlan[];
}

export function parseProductionDuration(value: unknown): ProductionDuration {
  const seconds = Number.parseInt(String(value ?? "30"), 10);
  if (!PRODUCTION_DURATIONS.includes(seconds as ProductionDuration)) {
    throw new Error("Full advert duration must be 15s, 30s, or 45s");
  }
  return seconds as ProductionDuration;
}

function words(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

export function voiceoverWordBudget(duration: unknown): number {
  const seconds = parseProductionDuration(duration);
  return Math.max(8, Math.floor((seconds - 1) * 2.1));
}

export function constrainVoiceoverText(input: {
  script: ExpandedScript;
  duration: unknown;
  brandName: string;
  maxWords?: number;
}): string {
  const source = (input.script.voiceoverText || input.script.script).trim();
  const cta = input.script.callToAction.trim();
  const brand = input.brandName.trim();
  const budget = Math.max(8, input.maxWords ?? voiceoverWordBudget(input.duration));
  const ctaWords = words(cta);
  const brandMissing = brand && !source.toLocaleLowerCase().includes(brand.toLocaleLowerCase());
  const brandWords = brandMissing ? words(brand) : [];
  const escapedCta = cta.replace(/[.*+?^$()|[\]\\]/g, "\\export function parseProductionDuration(value: unknown): ProductionDuration {
  const seconds = Number.parseInt(String(value ?? "30"), 10);
  if (!PRODUCTION_DURATIONS.includes(seconds as ProductionDuration)) {
    throw new Error("Full advert duration must be 15s, 30s, or 45s");
  }
  return seconds as ProductionDuration;
}
");
  const sourceWithoutCta = cta ? source.replace(new RegExp(escapedCta, "gi"), "").trim() : source;
  const available = Math.max(0, budget - brandWords.length - ctaWords.length);
  const bodyWords = words(sourceWithoutCta).slice(0, available);
  return [...brandWords, ...bodyWords, ...ctaWords].join(" ").replace(/\s+([,.!?])/g, "$1").trim();
}

function splitSentences(value: string): string[] {
  return value.match(/[^.!?\n]+(?:[.!?]+|$)/g)?.map((part) => part.trim()).filter(Boolean) ?? [];
}

function allocateEvenly(totalMs: number, count: number): number[] {
  const base = Math.floor(totalMs / count / 100) * 100;
  const result = Array.from({ length: count }, () => base);
  let remaining = totalMs - base * count;
  for (let index = 0; remaining > 0; index = (index + 1) % count) {
    const increment = Math.min(100, remaining);
    result[index] = result[index]! + increment;
    remaining -= increment;
  }
  return result;
}

function scenePrompt(input: {
  script: ExpandedScript;
  sceneIndex: number;
  sourceIndex: number;
  platform: string;
  brandName: string;
}): string {
  const source = input.script.scenes[input.sourceIndex] ?? input.script.scenes[0];
  const description = source?.description || input.script.hook || input.script.script;
  const direction = source?.visualDirection || "Show the product or service benefit through one clear action.";
  const framing = input.platform === "tiktok" || input.platform === "instagram"
    ? "vertical 9:16 social advertisement"
    : "widescreen 16:9 advertisement";
  return [
    `Shot ${input.sceneIndex + 1} for one coherent ${framing} for ${input.brandName}.`,
    description,
    direction,
    "Show one specific business benefit with believable people, consistent product identity, premium natural lighting, and a purposeful camera move.",
    "This shot must connect visually to the same advert, but must not repeat another shot.",
    "Imagery only: no generated words, captions, logos, labels, UI, watermarks, letters, or numbers.",
  ].join(" ");
}

export function compileVideoProductionPlan(input: {
  script: ExpandedScript;
  duration: unknown;
  platform: string;
  voiceoverDurationMs: number;
  brand: ProductionBrand;
  sourceAssetPaths?: readonly string[];
}): VideoProductionPlan {
  const targetDurationSeconds = parseProductionDuration(input.duration);
  const targetMs = targetDurationSeconds * 1000;
  if (!Number.isFinite(input.voiceoverDurationMs) || input.voiceoverDurationMs <= 0) {
    throw new Error("A measured voiceover is required before scene generation");
  }
  if (input.voiceoverDurationMs > targetMs - 350) {
    throw new Error(`Voiceover is ${Math.ceil(input.voiceoverDurationMs / 1000)}s and does not fit the approved ${targetDurationSeconds}s advert`);
  }
  if (!input.script.scenes.length) throw new Error("The approved script has no production scenes");
  if (!input.brand.name.trim()) throw new Error("Business name is required for video production");
  if (!input.brand.callToAction.trim()) throw new Error("Approved call to action is required for the end card");

  const visualDurationMs = targetMs - 3000;
  const sceneCount = Math.max(3, Math.min(8, Math.max(input.script.scenes.length, Math.ceil(visualDurationMs / 8000))));
  const durations = allocateEvenly(visualDurationMs, sceneCount);
  const narration = splitSentences(input.script.voiceoverText || input.script.script);
  const sourceAssets = (input.sourceAssetPaths ?? []).filter(Boolean);
  const vertical = input.platform === "tiktok" || input.platform === "instagram";

  const plan: VideoProductionPlan = {
    version: VIDEO_PRODUCTION_VERSION,
    targetDurationSeconds,
    fps: 30,
    platform: input.platform,
    width: vertical ? 1080 : 1920,
    height: vertical ? 1920 : 1080,
    voiceoverDurationMs: Math.round(input.voiceoverDurationMs),
    endCardDurationMs: 3000,
    brand: { ...input.brand, name: input.brand.name.trim(), callToAction: input.brand.callToAction.trim() },
    scenes: durations.map((durationMs, index) => {
      const sourceIndex = Math.min(input.script.scenes.length - 1, Math.floor(index * input.script.scenes.length / sceneCount));
      return {
        index,
        durationMs,
        narrationText: narration[index] ?? "",
        visualPrompt: scenePrompt({ script: input.script, sceneIndex: index, sourceIndex, platform: input.platform, brandName: input.brand.name.trim() }),
        sourceAssetPath: sourceAssets.length ? sourceAssets[index % sourceAssets.length]! : null,
      };
    }),
  };
  validateVideoProductionPlan(plan);
  return plan;
}

export function validateVideoProductionPlan(plan: VideoProductionPlan): void {
  const sceneMs = plan.scenes.reduce((sum, scene) => sum + scene.durationMs, 0);
  const targetMs = plan.targetDurationSeconds * 1000;
  if (sceneMs + plan.endCardDurationMs !== targetMs) throw new Error("Production timeline does not equal its target duration");
  if (plan.scenes.some((scene, index) => scene.index !== index || scene.durationMs < 2500 || scene.durationMs > 10_000)) {
    throw new Error("Production scenes must be ordered and between 2.5s and 10s");
  }
  if (!plan.brand.callToAction || !plan.brand.name) throw new Error("Production plan is missing brand or CTA");
}

export function productionQualityGate(input: {
  plan: VideoProductionPlan;
  finalDurationMs: number;
  completedSceneCount: number;
  hasAudio: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (input.completedSceneCount !== input.plan.scenes.length) return { ok: false, reason: "Not every planned scene was completed" };
  if (!input.hasAudio) return { ok: false, reason: "Final advert has no voiceover audio" };
  const expected = input.plan.targetDurationSeconds * 1000;
  if (Math.abs(input.finalDurationMs - expected) > 350) return { ok: false, reason: `Final duration ${input.finalDurationMs}ms does not match ${expected}ms` };
  return { ok: true };
}
