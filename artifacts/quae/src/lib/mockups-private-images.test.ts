import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mockupsSource = readFileSync(new URL("../pages/studio/mockups.tsx", import.meta.url), "utf8");
const sharedSource = readFileSync(new URL("../pages/studio/marketing-shared.tsx", import.meta.url), "utf8");

test("Mockup Studio renders every private image category with MarketingImage", () => {
  assert.match(mockupsSource, /<MarketingImage objectPath=\{product\.images\[0\]\.objectPath\}/);
  assert.match(mockupsSource, /<MarketingImage objectPath=\{path\} alt=\{`Brand Model candidate/);
  assert.match(mockupsSource, /<MarketingImage objectPath=\{version\.object_path\}/);
});

test("Mockup Studio never assigns a private object path directly to an img src", () => {
  assert.doesNotMatch(mockupsSource, /<img\b[^>]*src=\{privateImageUrl\(/);
  assert.doesNotMatch(mockupsSource, /<img\b[^>]*src=\{(?:path|version\.object_path|product\.images)/);
});

test("MarketingImage resolves signed URLs and shows a safe loading placeholder", () => {
  assert.match(sharedSource, /usePrivateImageUrl\(privateImageUrl\(objectPath\)\)/);
  assert.match(sharedSource, /url \? <img src=\{url\}/);
  assert.match(sharedSource, /role="status" aria-label="Loading secure image"/);
});

test("Mockup Studio restores pending candidate selection from persisted models", () => {
  assert.match(mockupsSource, /findPendingCandidateSet\(m\)/);
  assert.match(mockupsSource, /setCandidates\(\{model:pending,paths:pending\.reference_object_paths!\}\)/);
  assert.match(mockupsSource, /Your previous Brand Model candidates/);
  assert.match(mockupsSource, /Change preferences and create new candidates/);
  assert.match(mockupsSource, /pending&&!replacePending/);
});

test("Mockup Studio retains PR 30 model preferences and scene controls", () => {
  assert.match(mockupsSource, /3 · Model preferences/i);
  for (const label of ["Gender / Presentation", "Ethnicity / Appearance", "Age (adults only)", "Model Style", "Additional model direction"]) {
    assert.match(mockupsSource, new RegExp(label.replace(/[()]/g, "\\$&")));
  }
  assert.match(mockupsSource, /4 · Scene/);
  assert.match(mockupsSource, /<Select label="Scene"/);
  assert.match(mockupsSource, /scene==="custom".*Custom scene/s);
  assert.match(mockupsSource, /Change preferences and create new candidates/);
  assert.match(mockupsSource, /sceneDirection:direction\(\)/);
});
