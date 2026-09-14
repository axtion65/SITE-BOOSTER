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
  const validation = readFileSync(new URL("./feedbackInput.ts", import.meta.url), "utf8");
  const widget = readFileSync(
    new URL("../../../quae/src/components/feedback-widget.tsx", import.meta.url),
    "utf8",
  );

  assert.match(route, /FeedbackBody\.safeParse\(req\.body\)/);
  assert.match(validation, /MAX_FEEDBACK_MESSAGE_LENGTH = 4_000/);
  assert.match(validation, /MAX_FEEDBACK_EMAIL_LENGTH = 254/);
  assert.match(validation, /z\.string\(\)\.email\(\)\.max\(MAX_FEEDBACK_EMAIL_LENGTH\)/);
  assert.match(widget, /maxLength=\{MAX_FEEDBACK_MESSAGE_LENGTH\}/);
  assert.match(widget, /maxLength=\{MAX_FEEDBACK_EMAIL_LENGTH\}/);
  assert.match(widget, /VALID_EMAIL\.test\(email\.trim\(\)\)/);
});

test("public feedback storage is rate limited before its handler", () => {
  const route = readFileSync(new URL("../routes/feedback.ts", import.meta.url), "utf8");

  assert.match(route, /const feedbackRateLimit = createRateLimitMiddleware\(\{/);
  assert.match(route, /scope: "feedback\.create\.client"/);
  assert.match(route, /limit: 10/);
  assert.match(route, /globalLimit: 300/);
  assert.match(route, /router\.post\("\/feedback", feedbackRateLimit, async/);
});

test("feedback logs never copy customer messages or email addresses", () => {
  const route = readFileSync(new URL("../routes/feedback.ts", import.meta.url), "utf8");

  assert.match(route, /logger\.info\(\{ event: "feedback\.stored", type: normalizedType \}/);
  assert.doesNotMatch(route, /console\.log\(`\[feedback\]/);
  assert.doesNotMatch(route, /normalizedMessage\.slice/);
  assert.doesNotMatch(route, /<\$\{normalizedEmail\}>/);
});
