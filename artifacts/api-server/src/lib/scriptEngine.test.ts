import assert from "node:assert/strict";
import test from "node:test";
import { DURATION_SCENE_RANGES, durationPlanInstruction, normalizeScriptTiming, validateScript, type AdScript } from "./scriptEngine";

const cases = [
  [5, "tiktok-viral-hook"], [10, "ugc-review"], [15, "before-after"],
  [30, "product-demo"], [60, "brand-story"], [120, "tutorial"],
] as const;

for (const [seconds, template] of cases) {
  test(`${seconds}-second ${template} plan has valid count and exact timing`, () => {
    const [min] = DURATION_SCENE_RANGES[seconds];
    const script: AdScript = {
      script: `${template} product story`, hook: "A concrete hook", callToAction: "Try it today",
      scenes: Array.from({ length: min }, (_, index) => ({
        sceneNumber: index + 1,
        description: `${template.split("-")[0]} beat ${index + 1}: customer uses the product`,
        duration: "1s",
        visualDirection: `Cinematic close-up angle ${index + 1}, warm light, genuine reaction`,
      })),
      voiceoverText: "This specific product solves the customer's daily problem with one simple, believable demonstration.",
      suggestedMusic: "Warm rhythmic commercial score", estimatedDuration: "1s",
    };
    const normalized = normalizeScriptTiming(script, seconds);
    const total = normalized.scenes.reduce((sum, scene) => sum + Number.parseFloat(scene.duration), 0);
    assert.equal(total, seconds);
    assert.match(durationPlanInstruction(seconds, template), new RegExp(`exactly ${seconds} seconds`));
    assert.equal(validateScript(normalized, seconds, template).filter(error => error.includes("count") || error.includes("durations") || error.includes("voiceover")).length, 0);
  });
}
