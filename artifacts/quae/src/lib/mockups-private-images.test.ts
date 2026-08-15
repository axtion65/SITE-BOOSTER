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
