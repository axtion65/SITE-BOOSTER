import type { ExpandedScript } from "./falvideo";
import { splitApprovedSentences } from "./sentenceSegmentation";

export const VIDEO_PRODUCTION_VERSION = "bdb-native-motion-v4" as const;
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
  mediaType: "generated_video" | "source_image";
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
  const escapedCta = cta.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  const sourceWithoutCta = cta ? source.replace(new RegExp(escapedCta, "gi"), "").trim() : source;
  const available = Math.max(0, budget - brandWords.length - ctaWords.length);
  const bodyWords = words(sourceWithoutCta).slice(0, available);
  return [...brandWords, ...bodyWords, ...ctaWords].join(" ").replace(/\s+([,.!?])/g, "$1").trim();
}

/** Allocate every spoken word to exactly one ordered visual beat. */
function narrationBeats(value: string, count: number): string[] {
  const sentences = splitApprovedSentences(value);
  const units = sentences.length >= count ? sentences : words(value);
  const beats = Array.from({ length: count }, () => [] as string[]);
  units.forEach((unit, index) => {
    const beatIndex = Math.min(count - 1, Math.floor(index * count / units.length));
    beats[beatIndex]!.push(unit);
  });
  return beats.map((beat) => beat.join(" ").trim());
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
  sourceIndexes: number[];
  platform: string;
  brandName: string;
  narrationText: string;
  hasSourceAsset: boolean;
  durationMs: number;
}): string {
  const sources = input.sourceIndexes
    .map((index) => input.script.scenes[index])
    .filter((scene): scene is ExpandedScript["scenes"][number] => Boolean(scene));
  const description = sources.map((scene) => scene.description).filter(Boolean).join(" Then, ") || input.script.hook || input.script.script;
  const direction = sources.map((scene) => scene.visualDirection).filter(Boolean).join(" Then, ") || "Show the product or service benefit through one clear action.";
  const framing = input.platform === "tiktok" || input.platform === "instagram"
    ? "vertical 9:16 social advertisement"
    : "widescreen 16:9 advertisement";
  return [
    `Shot ${input.sceneIndex + 1} for one coherent ${framing} for ${input.brandName}.`,
    `Matching spoken beat: ${input.narrationText}`,
    description,
    direction,
    input.hasSourceAsset
      ? "Use the supplied approved customer image as the identity authority. Preserve its exact product, person, colors, and visual identity while turning it into one continuous moving shot."
      : "Use a visibly different composition and camera angle from the previous shot while keeping the same business story, audience, and brand mood.",
    `Begin the action in the first frame, sustain natural movement, and complete the full visual beat within ${(input.durationMs / 1000).toFixed(0)} seconds. Do not pause, freeze, reset to the opening frame, or end on a static hold.`,
    "Visually demonstrate only that spoken beat. Show one specific business benefit with believable people, consistent product identity, premium natural lighting, and a purposeful camera move.",
    "Do not introduce food, products, packaging, services, industries, or props that are not supported by this spoken beat or its approved scene.",
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
  const sourceAssets = [...new Set((input.sourceAssetPaths ?? []).filter(Boolean))];
  // Match the provider's useful native motion windows instead of generating
  // longer clips and discarding their final action during assembly.
  const sceneCount = targetDurationSeconds === 15 ? 2 : targetDurationSeconds === 30 ? 3 : 6;
  const durations = allocateEvenly(visualDurationMs, sceneCount);
  const narration = narrationBeats(input.script.voiceoverText || input.script.script, sceneCount);
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
      const sourceStart = Math.floor(index * input.script.scenes.length / sceneCount);
      const sourceEnd = Math.max(sourceStart, Math.floor((index + 1) * input.script.scenes.length / sceneCount) - 1);
      const sourceIndexes = Array.from({ length: sourceEnd - sourceStart + 1 }, (_, offset) => sourceStart + offset);
      // Each approved reference is used once. If the customer selected one
      // visual, it anchors the first clip and later clips use new compositions
      // instead of restarting from the same frame.
      const sourceAssetPath = sourceAssets[index] ?? null;
      return {
        index,
        durationMs,
        narrationText: narration[index] ?? "",
        visualPrompt: scenePrompt({ script: input.script, sceneIndex: index, sourceIndexes, platform: input.platform, brandName: input.brand.name.trim(), narrationText: narration[index] ?? "", hasSourceAsset: Boolean(sourceAssetPath), durationMs }),
        sourceAssetPath,
        mediaType: "generated_video",
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
  // Every production slot is long enough for a complete provider motion beat.
  if (plan.scenes.some((scene, index) => scene.index !== index || scene.durationMs < 1500 || scene.durationMs > 10_000)) {
    throw new Error("Production scenes must be ordered and between 1.5s and 10s");
  }
  if (plan.scenes.some((scene) => !scene.narrationText.trim())) throw new Error("Every production scene must map to a spoken beat");
  if (plan.scenes.some((scene) => scene.mediaType !== "generated_video")) throw new Error("Current adverts require continuous generated motion");
  if (plan.scenes.filter((scene) => scene.mediaType === "generated_video").length < 2) throw new Error("A finished advert needs at least two motion scenes");
  const sourcePaths = plan.scenes.map((scene) => scene.sourceAssetPath).filter((value): value is string => Boolean(value));
  if (new Set(sourcePaths).size !== sourcePaths.length) throw new Error("An approved source image cannot restart more than one motion scene");
  if (plan.targetDurationSeconds === 15 && (plan.scenes.length !== 2 || plan.scenes.some((scene) => scene.durationMs !== 6000))) {
    throw new Error("A 15-second advert requires two complete six-second motion scenes");
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
