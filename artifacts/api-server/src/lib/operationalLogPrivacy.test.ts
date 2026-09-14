import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("startup and database logs omit identities, SQL values, and raw database details", async () => {
  const [index, bootstrap, projects] = await Promise.all([
    source("../index.ts"),
    source("./adminBootstrap.ts"),
    source("../routes/projects.ts"),
  ]);

  assert.doesNotMatch(index, /pg_detail|\bsql,\s*err\b|\{\s*err\s*\}/);
  assert.doesNotMatch(bootstrap, /email:\s*user\.email|userId:\s*user\.id/);
  assert.doesNotMatch(projects, /drizzle_message|drizzle_stack|pg_detail|pg_hint|pg_where|pg_stack|cause\?\.message/);
  assert.match(projects, /safeErrorMetadata\(err\)/);
});

test("durable failure records use bounded metadata instead of provider messages", async () => {
  const [email, stripeLedger, production, mockupWorker] = await Promise.all([
    source("./email.ts"),
    source("./stripeWebhookLedger.ts"),
    source("./videoProduction.ts"),
    source("./mockupWorker.ts"),
  ]);

  assert.doesNotMatch(email, /await res\.text\(\)|transport:\s*\$\{msg\}/);
  assert.doesNotMatch(stripeLedger, /error\.message|String\(error\)/);
  assert.match(stripeLedger, /JSON\.stringify\(safeErrorMetadata\(error\)\)/);
  assert.match(production, /function failureText[\s\S]*JSON\.stringify\(safeErrorMetadata\(error\)\)/);
  assert.doesNotMatch(mockupWorker, /failureCode:code,error:message/);
});

test("maintenance and storage logs omit customer object paths and raw exceptions", async () => {
  const [admin, auth, feedback, objectStorage] = await Promise.all([
    source("../routes/admin.ts"),
    source("../routes/auth.ts"),
    source("../routes/feedback.ts"),
    source("./objectStorage.ts"),
  ]);

  assert.doesNotMatch(admin, /owner:\s*\$\{userId\}|message\s*=\s*err instanceof Error/);
  assert.doesNotMatch(auth, /user\.id,\s*error/);
  assert.doesNotMatch(feedback, /DB error:",\s*err/);
  assert.doesNotMatch(objectStorage, /s3:\/\/\$\{storageConfig\.bucket\}|treating object as private",\s*error/);
});
