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

test("public feedback input is bounded before storage", () => {
  const route = readFileSync(new URL("../routes/feedback.ts", import.meta.url), "utf8");
  const widget = readFileSync(
    new URL("../../../quae/src/components/feedback-widget.tsx", import.meta.url),
    "utf8",
  );

  assert.match(route, /MAX_FEEDBACK_MESSAGE_LENGTH = 4000/);
  assert.match(route, /MAX_FEEDBACK_EMAIL_LENGTH = 320/);
  assert.match(route, /FEEDBACK_TYPES\.has\(normalizedType\)/);
  assert.match(route, /normalizedMessage\.length > MAX_FEEDBACK_MESSAGE_LENGTH/);
  assert.match(route, /normalizedEmail\.length > MAX_FEEDBACK_EMAIL_LENGTH/);
  assert.match(widget, /maxLength=\{MAX_FEEDBACK_MESSAGE_LENGTH\}/);
  assert.match(widget, /maxLength=\{MAX_FEEDBACK_EMAIL_LENGTH\}/);
});

test("public feedback storage is rate limited before its handler", () => {
  const route = readFileSync(new URL("../routes/feedback.ts", import.meta.url), "utf8");

  assert.match(route, /const feedbackRateLimit = createRateLimitMiddleware\(\{/);
  assert.match(route, /scope: "feedback\.create\.client"/);
  assert.match(route, /limit: 10/);
  assert.match(route, /globalLimit: 300/);
  assert.match(route, /router\.post\("\/feedback", feedbackRateLimit, async/);
});
