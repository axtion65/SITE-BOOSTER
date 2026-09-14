import assert from "node:assert/strict";
import test from "node:test";
import {
  FeedbackBody,
  MAX_FEEDBACK_EMAIL_LENGTH,
  MAX_FEEDBACK_MESSAGE_LENGTH,
} from "./feedbackInput";

test("feedback accepts a valid optional reply address and normalizes its text", () => {
  const parsed = FeedbackBody.parse({
    type: "idea",
    message: "  Please add schedules.  ",
    email: "  customer@example.com  ",
  });
  assert.deepEqual(parsed, {
    type: "idea",
    message: "Please add schedules.",
    email: "customer@example.com",
  });
  assert.equal(MAX_FEEDBACK_MESSAGE_LENGTH, 4_000);
  assert.equal(MAX_FEEDBACK_EMAIL_LENGTH, 254);
});

test("feedback rejects malformed addresses, oversized fields, and unknown data", () => {
  const valid = { type: "bug", message: "Something broke" };
  assert.equal(FeedbackBody.safeParse({ ...valid, email: "" }).success, true);
  assert.equal(FeedbackBody.safeParse({ ...valid, email: "not-an-email" }).success, false);
  assert.equal(FeedbackBody.safeParse({ ...valid, message: "m".repeat(4_001) }).success, false);
  assert.equal(FeedbackBody.safeParse({ ...valid, unexpected: true }).success, false);
});
