export interface AdScene {
  sceneNumber: number;
  description: string;
  duration: string;
  visualDirection: string;
}

export interface AdScript {
  script: string;
  hook: string;
  callToAction: string;
  scenes: AdScene[];
  voiceoverText: string;
  suggestedMusic: string;
  estimatedDuration: string;
}

export const DURATION_SCENE_RANGES: Record<number, readonly [number, number]> = {
  5: [1, 2], 10: [2, 3], 15: [3, 5], 30: [5, 7], 45: [7, 9],
  60: [8, 12], 90: [12, 16], 120: [16, 22], 180: [22, 30],
};

export const TEMPLATE_BEATS: Record<string, string[]> = {
  "tiktok-viral-hook": ["immediate pattern interrupt", "curiosity", "fast product action", "payoff", "spoken CTA"],
  "ugc-review": ["first-person problem and skepticism", "discovery", "product use", "specific result", "authentic recommendation"],
  "before-after": ["strong problem state", "turning point", "product use", "visible transformation", "satisfying result"],
  "product-demo": ["problem", "natural product introduction", "feature demonstration and benefit", "second useful feature", "payoff"],
  "product-unboxing": ["anticipation", "package arrival", "opening", "reaction", "product use", "verdict"],
  "flash-sale": ["visual urgency", "fast fulfillment", "product demand", "buyer excitement", "spoken CTA"],
  "amazon-listing": ["hero benefit", "multiple product angles", "product in use", "scale and context", "comparison advantage", "buyer confidence"],
  "brand-story": ["origin", "problem", "mission", "struggle", "customer impact", "emotional invitation"],
  "testimonial-compilation": ["believable customer experiences", "specific benefits", "escalating proof", "consensus payoff"],
  "shopify-promo": ["aspirational lifestyle", "product integration", "benefit demonstration", "delivery and unboxing", "conversion ending"],
  tutorial: ["problem", "sequential steps", "product use", "common mistake", "correct method", "final result"],
  "instagram-reel": ["beautiful first frame", "recurring visual motif", "lifestyle", "transformation", "memorable ending"],
};

export function parseRequestedDuration(value?: string | null): number {
  const normalized = (value || "15s").trim().toLowerCase();
  const amount = Number.parseInt(normalized, 10);
  const seconds = normalized.endsWith("m") ? amount * 60 : amount;
  return DURATION_SCENE_RANGES[seconds] ? seconds : 15;
}

export function durationPlanInstruction(seconds: number, templateType?: string): string {
  const [min, max] = DURATION_SCENE_RANGES[seconds];
  const beats = TEMPLATE_BEATS[templateType || ""] ?? ["hook", "problem", "demonstration", "payoff", "CTA"];
  return `DURATION CONTRACT (known before writing): exactly ${seconds} seconds; ${min}-${max} scenes, choosing the fewest needed for excellent pacing. Give every scene a numeric duration and make their sum exactly ${seconds}. One major action per shot; simplify or split overloaded action. Story beats for this format: ${beats.join(" → ")}. For longer runtimes develop setup, stakes, discovery, demonstrations, objections, proof, transformation, payoff and CTA naturally without repeated shots, actions, or voiceover ideas.`;
}

const TEXT_RISK = /\b(caption|subtitle|text overlay|typograph|written words?|price|url|website|sign|poster|menu|receipt|document|readable screen|dashboard|phone ui|browser page|review|star rating|countdown|label|logo)\b/i;
const ACTION_WORDS = /\b(and then|then|followed by|while simultaneously|at the same time|before .* and|after .* and)\b/gi;

function secondsOf(scene: AdScene): number {
  return Number.parseFloat(String(scene.duration).replace(/[^\d.]/g, "")) || 0;
}
function wordCount(value: string): number { return value.trim().split(/\s+/).filter(Boolean).length; }
function fingerprint(scene: AdScene): string {
  return `${scene.description} ${scene.visualDirection}`.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(w => w.length > 4).slice(0, 8).sort().join(" ");
}

export function validateScript(script: AdScript, seconds: number, templateType?: string): string[] {
  const errors: string[] = [];
  const [min, max] = DURATION_SCENE_RANGES[seconds];
  if (!Array.isArray(script.scenes) || script.scenes.length < min || script.scenes.length > max) errors.push(`scene count must be ${min}-${max}`);
  const total = (script.scenes || []).reduce((sum, scene) => sum + secondsOf(scene), 0);
  if (Math.abs(total - seconds) > 0.05) errors.push(`scene durations total ${total}, not ${seconds}`);
  const fingerprints = new Set<string>();
  for (const [index, scene] of (script.scenes || []).entries()) {
    if (secondsOf(scene) <= 0) errors.push(`scene ${index + 1} lacks a numeric duration`);
    if (TEXT_RISK.test(`${scene.description} ${scene.visualDirection}`)) errors.push(`scene ${index + 1} requests visible text`);
    if (secondsOf(scene) <= 3 && ((`${scene.description} ${scene.visualDirection}`.match(ACTION_WORDS) || []).length > 1)) errors.push(`scene ${index + 1} is overloaded`);
    const fp = fingerprint(scene); if (fp && fingerprints.has(fp)) errors.push(`scene ${index + 1} duplicates another scene`); fingerprints.add(fp);
  }
  const maxWords = Math.floor(seconds * 2.7); // natural commercial delivery, ~162 wpm
  if (wordCount(script.voiceoverText || "") > maxWords) errors.push(`voiceover exceeds ${maxWords} words`);
  const beats = TEMPLATE_BEATS[templateType || ""];
  if (beats && !beats.some(beat => JSON.stringify(script).toLowerCase().includes(beat.split(" ")[0]))) errors.push("selected template structure is not evident");
  return errors;
}

export function normalizeScriptTiming(script: AdScript, seconds: number): AdScript {
  const scenes = (script.scenes || []).map((scene, index) => ({ ...scene, sceneNumber: index + 1 }));
  if (!scenes.length) throw new Error("AI returned no scenes");
  const raw = scenes.map(secondsOf); const rawTotal = raw.reduce((a, b) => a + b, 0);
  const units = Math.round(seconds * 10);
  const allocated = raw.map(value => Math.max(1, Math.floor((value || 1) / (rawTotal || scenes.length) * units)));
  let delta = units - allocated.reduce((a, b) => a + b, 0);
  for (let cursor = 0; delta !== 0; cursor = (cursor + 1) % allocated.length) {
    if (delta > 0) { allocated[cursor]++; delta--; }
    else if (allocated[cursor] > 1) { allocated[cursor]--; delta++; }
  }
  scenes.forEach((scene, index) => { scene.duration = `${allocated[index] / 10}s`; });
  const maxWords = Math.floor(seconds * 2.7);
  const words = (script.voiceoverText || "").trim().split(/\s+/).filter(Boolean);
  const voiceoverText = words.length > maxWords ? `${words.slice(0, maxWords).join(" ").replace(/[,:;]$/, "")}.` : words.join(" ");
  return { ...script, scenes, voiceoverText, estimatedDuration: `${seconds}s` };
}
