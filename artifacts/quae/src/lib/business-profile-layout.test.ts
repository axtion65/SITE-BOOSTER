import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("business profile save bar stays above the feedback control", () => {
  const business = readFileSync(new URL("../pages/studio/business.tsx", import.meta.url), "utf8");
  const feedback = readFileSync(new URL("../components/feedback-widget.tsx", import.meta.url), "utf8");

  assert.match(feedback, /fixed bottom-6 right-6/);
  assert.match(business, /sticky bottom-20/);
  assert.doesNotMatch(business, /sticky bottom-4/);
});
