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
  assert.match(recovery, /isCurrentRecoveryRun\(latest\)/);
  assert.match(recovery, /b\.name business_name/);
  assert.match(recovery, /b\.primary_cta business_primary_cta/);
  assert.match(recovery, /ownedWebsiteImportMatchesCampaign\(campaign\)/);
  assert.match(recovery, /missingGenerationEvidence\(contextSnapshot\)/);
  assert.doesNotMatch(recovery, /openai|fal|provider|credit|charge/i);
});

test("a failed current-revision recovery reports a safe error before any duplicate can be queued", async () => {
  const [route, page] = await Promise.all([
    readFile(
      new URL("../../../api-server/src/routes/campaigns.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../pages/studio/campaign-detail.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  const recovery = route.slice(
    route.indexOf('router.post("/campaigns/:id/rebuild"'),
    route.indexOf('router.post("/campaigns/:id/run-team"'),
  );
  const replayGuard = recovery.slice(
    recovery.indexOf("if (isFailedRecoveryRun(latest))"),
    recovery.indexOf("if (!canRecoverCampaignRun"),
  );
  assert.match(replayGuard, /\["queued", "running"\]\.includes\(latest\.status\)/);
  assert.match(replayGuard, /isCurrentRecoveryRun\(latest\)/);
  assert.match(replayGuard, /res\.status\(409\)/);
  assert.match(replayGuard, /code: "campaign_recovery_failed"/);
  assert.doesNotMatch(replayGuard, /queueCampaignRun/);
  assert.match(
    page,
    /path === "rebuild"[\s\S]*We couldn’t restart this campaign\./,
  );
});


test("incomplete legacy evidence is rejected before a recovery run is queued", async () => {
  const route = await readFile(
    new URL("../../../api-server/src/routes/campaigns.ts", import.meta.url),
    "utf8",
  );
  const recovery = route.slice(
    route.indexOf('router.post("/campaigns/:id/rebuild"'),
    route.indexOf('router.post("/campaigns/:id/run-team"'),
  );
  const sourceGuard = recovery.indexOf(
    "!ownedWebsiteImportMatchesCampaign(campaign)",
  );
  const evidenceGuard = recovery.indexOf(
    "missingGenerationEvidence(contextSnapshot)",
  );
  const queue = recovery.indexOf("queueCampaignRun(pool");

  assert.ok(sourceGuard >= 0 && sourceGuard < queue);
  assert.ok(evidenceGuard >= 0 && evidenceGuard < queue);
  assert.match(recovery, /code: "campaign_source_unavailable"/);
  assert.match(recovery, /code: "campaign_evidence_incomplete"/);
});
