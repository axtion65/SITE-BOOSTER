import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("advanced studio editors expose programmatic control names", () => {
  const studio = read("../pages/studio/index.tsx");
  for (const label of [
    "Product name",
    "Product description and benefits",
    "Target audience",
    "Platform",
    "Advertising hook",
    "Full voiceover",
  ]) {
    assert.match(studio, new RegExp(`aria-label=[{\"]+${label}`));
  }
  assert.match(studio, /aria-label=\{`Scene \$\{scene\.sceneNumber\} description`\}/);
  assert.match(studio, /aria-label=\{`Scene \$\{scene\.sceneNumber\} visual direction`\}/);
});

test("account, brand, admin, and feedback controls expose programmatic names", () => {
  const settings = read("../pages/studio/settings.tsx");
  const brand = read("../pages/studio/brand-kit.tsx");
  const admin = read("../pages/admin.tsx");
  const feedback = read("../components/feedback-widget.tsx");

  assert.match(settings, /aria-label="Display name"/);
  assert.match(brand, /aria-label=\{`\$\{label\} hex value`\}/);
  for (const label of [
    "Render test prompt",
    "Broadcast audience",
    "Broadcast subject",
    "Broadcast message",
    "Search subscribers by name or email",
    "Filter subscribers by plan",
    "Search users by name or email",
  ]) {
    assert.match(admin, new RegExp(`aria-label="${label}"`));
  }
  assert.match(feedback, /role="dialog" aria-label="Share feedback"/);
  assert.match(feedback, /aria-label="Feedback message"/);
  assert.match(feedback, /aria-label="Reply email \(optional\)"/);
});

test("campaign revision fields expose programmatic names in every review state", () => {
  const campaign = read("../pages/studio/campaign-detail.tsx");
  assert.match(campaign, /aria-label="Additional campaign revision instructions"/);
  assert.match(campaign, /aria-label="Requested campaign changes"/);
});
