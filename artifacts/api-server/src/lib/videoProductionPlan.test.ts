import assert from "node:assert/strict";
import test from "node:test";
import { compileVideoProductionPlan, productionQualityGate } from "./videoProductionPlan";
import type { ExpandedScript } from "./falvideo";

const script: ExpandedScript = {
  script: "Stop wasting hours on marketing. Quae builds approved campaigns and visuals. Review the details. Start building your campaign.",
  hook: "Stop wasting hours on marketing.",
  callToAction: "Start building your campaign.",
  voiceoverText: "Stop wasting hours on marketing. Quae builds approved campaigns and visuals. Review the details. Start building your campaign.",
  suggestedMusic: "confident",
  estimatedDuration: "30s",
  scenes: [
    { sceneNumber: 1, description: "A business owner overwhelmed by marketing tasks.", duration: "7s", visualDirection: "Open on the real problem." },
    { sceneNumber: 2, description: "The owner organizes a clear campaign.", duration: "7s", visualDirection: "Show the workflow improving." },
    { sceneNumber: 3, description: "Professional campaign visuals are ready.", duration: "7s", visualDirection: "Show tangible output." },
    { sceneNumber: 4, description: "The owner confidently launches.", duration: "6s", visualDirection: "End on the benefit." },
  ],
};

test("30-second production keeps every approved beat and reserves a deterministic CTA", () => {
  const plan = compileVideoProductionPlan({
    script,
    duration: "30s",
    platform: "instagram",
    voiceoverDurationMs: 18_400,
    brand: { name: "Quae", website: "quae.ai", callToAction: "Start building your campaign." },
    sourceAssetPaths: ["/objects/products/approved.png"],
  });
  assert.equal(plan.targetDurationSeconds, 30);
  assert.equal(plan.width, 1080);
  assert.equal(plan.height, 1920);
  assert.equal(plan.endCardDurationMs, 3000);
  assert.equal(plan.scenes.length, 4);
  assert.equal(plan.scenes.reduce((sum, scene) => sum + scene.durationMs, 0), 27_000);
  assert.ok(plan.scenes.every((scene) => scene.sourceAssetPath === "/objects/products/approved.png"));
  assert.ok(plan.scenes.every((scene) => !/Source visual context \(adapt into the one shot/i.test(scene.visualPrompt)));
  assert.match(plan.scenes[0]!.visualPrompt, /business owner overwhelmed/i);
  assert.match(plan.scenes[3]!.visualPrompt, /confidently launches/i);
});

test("voiceover is measured before any provider plan can be accepted", () => {
  assert.throws(() => compileVideoProductionPlan({
    script,
    duration: "15s",
    platform: "tiktok",
    voiceoverDurationMs: 15_000,
    brand: { name: "Quae", callToAction: "Start now" },
  }), /does not fit/);
});

test("45-second production splits into bounded independent scenes", () => {
  const plan = compileVideoProductionPlan({
    script,
    duration: "45s",
    platform: "youtube",
    voiceoverDurationMs: 31_000,
    brand: { name: "Quae", callToAction: "Start now" },
  });
  assert.equal(plan.scenes.length, 6);
  assert.ok(plan.scenes.every((scene) => scene.durationMs <= 10_000));
  assert.equal(plan.scenes.reduce((sum, scene) => sum + scene.durationMs, 0) + plan.endCardDurationMs, 45_000);
});

test("quality gate rejects short, silent, or incomplete output", () => {
  const plan = compileVideoProductionPlan({
    script,
    duration: "30s",
    platform: "youtube",
    voiceoverDurationMs: 18_400,
    brand: { name: "Quae", callToAction: "Start now" },
  });
  assert.deepEqual(productionQualityGate({ plan, finalDurationMs: 30_000, completedSceneCount: 4, hasAudio: true }), { ok: true });
  const short = productionQualityGate({ plan, finalDurationMs: 6_000, completedSceneCount: 4, hasAudio: true });
  const incomplete = productionQualityGate({ plan, finalDurationMs: 30_000, completedSceneCount: 3, hasAudio: true });
  const silent = productionQualityGate({ plan, finalDurationMs: 30_000, completedSceneCount: 4, hasAudio: false });
  assert.equal(short.ok, false); if (!short.ok) assert.match(short.reason, /duration/i);
  assert.equal(incomplete.ok, false); if (!incomplete.ok) assert.match(incomplete.reason, /every planned scene/i);
  assert.equal(silent.ok, false); if (!silent.ok) assert.match(silent.reason, /voiceover/i);
});
