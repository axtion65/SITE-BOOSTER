import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../routes/admin.ts", import.meta.url),
  "utf8",
);
const operationsRoute = source.slice(
  source.indexOf('router.get("/admin/operations"'),
  source.indexOf('router.get("/admin/render-debug"'),
);

test("admin storage health recognizes the object storage bucket variables", () => {
  assert.match(operationsRoute, /process\.env\.AWS_S3_BUCKET_NAME/);
  assert.match(operationsRoute, /process\.env\.BUCKET/);
  assert.doesNotMatch(operationsRoute, /process\.env\.AWS_BUCKET_NAME/);
});

test("admin operations reports Resend configuration and queued delivery failures", () => {
  assert.match(operationsRoute, /process\.env\.RESEND_API_KEY/);
  assert.match(operationsRoute, /from\(emailQueueTable\)/);
  assert.match(operationsRoute, /pendingEmails/);
  assert.match(operationsRoute, /failedEmails/);
  assert.match(operationsRoute, /emailQueueTable\.status, "failed"/);
});
