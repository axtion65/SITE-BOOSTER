import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { RENDERING_MODELS, RENDERING_MODEL_BY_ID } from "@workspace/plans";
import { buildFalRenderRequest, type ExpandedScript } from "./falvideo";

const approved: ExpandedScript = { script:"approved brief", hook:"approved hook", callToAction:"approved CTA", voiceoverText:"approved voiceover", scenes:[{sceneNumber:1,description:"approved scene brief",duration:"5s",visualDirection:"approved camera direction"}],suggestedMusic:"quiet",estimatedDuration:"5s" };

test("shared catalogue is authoritative and LTX Fast is text-only", () => {
  assert.equal(RENDERING_MODELS.find(m => m.id === "ltx-fast"), RENDERING_MODEL_BY_ID["ltx-fast"]);
  assert.equal(RENDERING_MODEL_BY_ID["ltx-fast"].supports.imageToVideo, false);
});

test("Create New never sends image_url and approved scene brief reaches text-to-video", () => {
  const request = buildFalRenderRequest(approved,"instagram","5s","ltx-fast",undefined,"create_new");
  assert.match(request.modelPath,/text-to-video/);
  assert.equal(request.input.image_url,undefined);
  assert.match(String(request.input.prompt),/approved scene brief/i);
});

test("Create New rejects stale images while Animate accepts its one explicit source", () => {
  assert.throws(() => buildFalRenderRequest(approved,"instagram","5s","wan",undefined,"create_new","https://example.test/stale.png"));
  const request = buildFalRenderRequest(approved,"instagram","5s","wan",undefined,"animate","https://example.test/owned.png");
  assert.equal(request.input.image_url,"https://example.test/owned.png");
});

test("legacy balances and in-flight charges are preserved with attempt-scoped refunds", async () => {
  const sql = await readFile(new URL("../../../../lib/db/migrations/0014_render_intent_credit_ledger.sql", import.meta.url),"utf8");
  assert.doesNotMatch(sql,/UPDATE\s+users\s+SET\s+credits/i);
  assert.match(sql,/legacy_backfill[\s\S]*credits,credits/i);
  assert.match(sql,/UPDATE\s+projects[\s\S]*credit_charge/i);
  assert.match(sql,/UNIQUE INDEX[\s\S]*project_id,\s*kind,\s*attempt/i);
});

test("credit debit, project persistence, and audit entry share one transaction", async () => {
  const source = await readFile(new URL("../routes/projects.ts", import.meta.url), "utf8");
  assert.match(source,/db\.transaction[\s\S]*credits[\s\S]*INSERT|db\.transaction[\s\S]*insert\(creditLedgerTable\)/i);
  assert.match(source,/renderAttempt:\s*sql`\$\{projectsTable\.renderAttempt\}\s*\+\s*1`/);
  assert.match(source,/refundedAt:\s*null/);
});

test("a timed-out project recovers its completed provider result without starting another render", async () => {
  const source = await readFile(new URL("../routes/projects.ts", import.meta.url), "utf8");
  const getRoute = source.slice(
    source.indexOf('router.get("/projects/:id"'),
    source.indexOf('/** Authenticated download'),
  );
  assert.match(getRoute, /\["processing", "failed"\]\.includes\(project\.status\) && token/);
  assert.match(getRoute, /inArray\(projectsTable\.status, \["processing", "failed"\]\)/);
  assert.match(getRoute, /eq\(projectsTable\.thumbnailUrl, token\)/);
  assert.match(getRoute, /pollFalVideoRender\(token\)/);
  assert.doesNotMatch(getRoute, /submitFalVideoRender/);
});
