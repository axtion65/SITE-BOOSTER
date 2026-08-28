import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("failed campaign Start Strategy uses the existing recovery route once with visible progress", async () => {
  const page = await readFile(
    new URL("../pages/studio/campaign-detail.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /run\?\.status === "failed" \? "rebuild" : "run-team"/);
  assert.match(page, /disabled=\{busy !== null \|\| active\}/);
  assert.match(page, /Starting strategy…/);
  assert.match(page, /role="status"/);
  assert.match(page, /await load\(\)/);
  assert.match(page, /We couldn’t start your campaign\. Please try again\./);
});

test("recovery remains authenticated, owner scoped, idempotent, and provider free", async () => {
  const route = await readFile(
    new URL("../../../api-server/src/routes/campaigns.ts", import.meta.url),
    "utf8",
  );
  const recovery = route.slice(
    route.indexOf('router.post("/campaigns/:id/rebuild"'),
    route.indexOf('router.post("/campaigns/:id/run-team"'),
  );
  assert.match(recovery, /await owner\(req, res\)/);
  assert.match(
    recovery,
    /JOIN businesses b ON b\.id=c\.business_id AND b\.user_id=c\.user_id/,
  );
  assert.match(recovery, /WHERE c\.id=\$1 AND c\.user_id=\$2/);
  assert.match(recovery, /recoveryIdempotencyKey\(campaign, latest\)/);
  assert.match(recovery, /isFailedRecoveryRun\(latest\)/);
  assert.doesNotMatch(recovery, /openai|fal|provider|credit|charge/i);
});
