import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("transactional email logs omit recipients and customer content", () => {
  const source = readFileSync(new URL("./email.ts", import.meta.url), "utf8");
  const loggerCalls = source
    .split("\n")
    .filter((line) => line.includes("logger."))
    .join("\n");

  assert.doesNotMatch(source, /console\.(?:log|warn|error)/);
  assert.doesNotMatch(loggerCalls, /\bto\b|\btoName\b|\bsubject\b|\bhtml\b|\btext\b/);
  assert.match(source, /event: "email\.queued", queueId: queued\?\.id/);
  assert.match(source, /event: "email\.provider_rejected", statusCode: res\.status/);
  assert.match(source, /event: "email\.queue_status_failed", queueId: id/);
});
