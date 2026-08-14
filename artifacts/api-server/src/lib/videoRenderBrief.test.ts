import assert from "node:assert/strict";
import test from "node:test";
import { buildVideoPrompt } from "./falvideo";
import { compileVideoRenderBrief } from "./videoRenderBrief";
import type { ExpandedScript } from "./falvideo";

const approved: ExpandedScript = {
  script: "Make your group stand out. Custom shirts are exactly $10. Bring your business, team, or event together.",
  hook: "Make your message wearable.",
  callToAction: "Big Al's custom T-shirts — $10.",
  scenes: [1,2,3,4].map(n => ({ sceneNumber:n, duration:"8s", description:`Approved scene ${n}`, visualDirection:`Approved visual ${n}` })),
  voiceoverText: "Make your group stand out with custom shirts for your business, team, or event. Choose a bold design that makes your message wearable. Big Al's custom T-shirts are exactly ten dollars. Big Al's custom T-shirts — $10.",
  suggestedMusic: "Upbeat", estimatedDuration:"30s",
};

test("30 second campaign compiles one focused 5 second LTX brief without mutating approval", () => {
  const snapshot = JSON.stringify(approved);
  const brief = compileVideoRenderBrief(approved, "30s", "ltx-fast");
  assert.equal(brief.renderDurationSeconds, 5);
  assert.equal(brief.visualBeats.length, 1);
  assert.match(brief.marketingMessage, /\$10/);
  assert.doesNotMatch(brief.marketingMessage, /starting at|\bfrom\b/i);
  assert.ok(brief.voiceoverText.split(/\s+/).length <= 12);
  const prompt = buildVideoPrompt(approved, "instagram", "5s", undefined, brief);
  assert.match(prompt, /Approved scene 1/);
  assert.doesNotMatch(prompt, /Approved scene [234]/);
  assert.doesNotMatch(brief.marketingMessage, /starting at|\bfrom\b/i);
  assert.equal(JSON.stringify(approved), snapshot);
});

test("switching models recompiles richer 10 second brief", () => {
  const five = compileVideoRenderBrief(approved, "30s", "ltx-fast");
  const ten = compileVideoRenderBrief(approved, "30s", "kling");
  assert.notDeepEqual(five, ten);
  assert.equal(ten.renderDurationSeconds, 10);
  assert.equal(ten.visualBeats.length, 2);
});

test("capable models preserve the complete approved creative", () => {
  const shortApproval = { ...approved, scenes: approved.scenes.slice(0, 1), voiceoverText: "Approved concise narration." };
  const brief = compileVideoRenderBrief(shortApproval, "5s", "kling");
  assert.equal(brief.shortened, false);
  assert.equal(brief.voiceoverText, shortApproval.voiceoverText);
  assert.equal(brief.visualBeats.length, shortApproval.scenes.length);
});
