import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("feedback only reports success after storage succeeds", () => {
  const route = readFileSync(new URL("../routes/feedback.ts", import.meta.url), "utf8");
  const widget = readFileSync(
    new URL("../../../quae/src/components/feedback-widget.tsx", import.meta.url),
    "utf8",
  );

  assert.match(route, /res\.status\(500\)\.json\(\{ error: "Failed to save feedback" \}\)/);
  assert.doesNotMatch(route, /Still return success/);

  assert.match(widget, /if \(!response\.ok\)/);
  assert.match(widget, /setSubmitError\(/);
  assert.match(widget, /mailto:info@quae\.ai/);
  assert.match(widget, /setStep\("sent"\)/);
});
