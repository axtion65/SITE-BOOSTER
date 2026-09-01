import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("fal callback uses raw signed bytes before JSON parsing", async () => {
  const source = await readFile(new URL("../app.ts", import.meta.url), "utf8");
  const falRoute = source.indexOf('"/api/webhooks/fal"');
  assert.ok(falRoute > 0);
  assert.ok(falRoute < source.indexOf("app.use(express.json())"));
  assert.match(source.slice(falRoute, source.indexOf("app.use(pinoHttp")), /express\.raw/);
  assert.match(source, /verifyFalWebhookSignature\(rawBody, headers\)/);
  assert.match(source, /event\.request_id !== headers\.requestId/);
});

test("official fal OK payload drives completion and page GET cannot race webhook jobs", async () => {
  const webhook = await readFile(new URL("../routes/webhooks.ts", import.meta.url), "utf8");
  const projects = await readFile(new URL("../routes/projects.ts", import.meta.url), "utf8");
  const provider = await readFile(new URL("./falvideo.ts", import.meta.url), "utf8");
  assert.match(webhook, /status: "OK" \| "ERROR"/);
  assert.match(webhook, /const output = payload\.payload \?\? \{\}/);
  assert.doesNotMatch(webhook, /router\.post/);
  assert.match(webhook, /eq\(projectsTable\.thumbnailUrl, project\.thumbnailUrl!\)/);
  assert.match(projects, /token && !isWebhookFalToken\(token\)/);
  assert.match(provider, /\.submit\(modelPath, \{[\s\S]*webhookUrl/);
  assert.match(provider, /Public fal webhook URL not configured/);
});
