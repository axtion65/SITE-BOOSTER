import assert from "node:assert/strict";
import test from "node:test";
import {
  campaignWorkspaceNextAction,
  campaignWorkspaceProgress,
  currentCampaignVideoCount,
} from "./campaignWorkspace";

const facts = (extra = {}) => ({
  hasBrief: true,
  hasStrategy: true,
  approved: true,
  visualCount: 1,
  videoCount: 1,
  ...extra,
});
test("progress only completes stages backed by saved facts", () => {
  assert.deepEqual(
    campaignWorkspaceProgress(
      facts({ approved: false, visualCount: 0, videoCount: 0 }),
    ).map((x) => x.complete),
    [true, true, false, false, false, false],
  );
});
test("continue campaign selects the next authoritative action", () => {
  assert.equal(
    campaignWorkspaceNextAction(
      facts({
        hasStrategy: false,
        approved: false,
        visualCount: 0,
        videoCount: 0,
      }),
    ),
    "create_strategy",
  );
  assert.equal(
    campaignWorkspaceNextAction(facts({ visualCount: 0, videoCount: 0 })),
    "create_visual",
  );
  assert.equal(
    campaignWorkspaceNextAction(facts({ videoCount: 0 })),
    "create_video",
  );
  assert.equal(campaignWorkspaceNextAction(facts()), "review_assets");
});
test("only a quality-passed current campaign video completes the campaign", () => {
  const oldVideoCount = currentCampaignVideoCount([
    {
      is_current: false,
      status: "completed",
      quality_status: "passed",
      video_url: "/objects/lettuce.mp4",
    },
  ]);
  assert.equal(oldVideoCount, 0);
  assert.equal(
    campaignWorkspaceNextAction(facts({ videoCount: oldVideoCount })),
    "create_video",
  );
  assert.equal(
    campaignWorkspaceProgress(facts({ videoCount: oldVideoCount })).at(-1)
      ?.complete,
    false,
  );

  assert.equal(
    currentCampaignVideoCount([
      {
        is_current: true,
        status: "completed",
        quality_status: "passed",
        video_url: "/objects/current.mp4",
      },
    ]),
    1,
  );
});
test("workspace implementation is read-only and never imports a provider", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("./campaignWorkspace.ts", import.meta.url), "utf8"),
  );
  assert.doesNotMatch(source, /fal|openai|provider/i);
});
test("aggregate workspace scopes campaign and every asset query to its owner", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../routes/campaigns.ts", import.meta.url), "utf8"),
  );
  const route = source.slice(
    source.indexOf('router.get("/campaigns/:id/workspace"'),
    source.indexOf('router.get("/campaigns/:id"'),
  );
  assert.match(route, /c\.id=\$1 AND c\.user_id=\$2/);
  assert.match(route, /mp\.campaign_id=\$1 AND mp\.user_id=\$2/);
  assert.match(route, /p\.campaign_id=\$1 AND p\.user_id=\$2/);
  assert.match(route, /p\.campaign_run_id=vb\.campaign_run_id/);
  assert.match(route, /p\.mockup_version_id=vb\.mockup_version_id/);
  assert.match(route, /s\.active/);
  assert.match(route, /currentCampaignVideoCount\(videos\)/);
  assert.doesNotMatch(route, /prompt_version|structured_output|agents,/);
  assert.match(route, /publicCampaignRun/);
});

test("revision queue preserves the prior quality feedback for the repair run", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../routes/campaigns.ts", import.meta.url), "utf8"),
  );
  const route = source.slice(
    source.indexOf('router.post("/campaigns/:id/request-changes"'),
    source.indexOf("export default router"),
  );
  assert.match(route, /const sourceRun = await ownedCampaignRun/);
  assert.match(route, /publicCampaignResult\(sourceRun\.final_result\)/);
  assert.match(route, /priorQualityFeedback/);
  assert.match(route, /factcheck: priorResult\.factcheck/);
  assert.match(route, /qa: priorResult\.qa/);
});

test("valid revision runs repair the saved draft before the full pipeline", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../agents/pipeline.ts", import.meta.url), "utf8"),
  );
  assert.match(source, /rewrite-customer-revision\.v1/);
  assert.match(source, /previous\.status IN \('ready_for_review','needs_revision'\)/);
  assert.match(source, /Do not restart ideation or invent new facts/);
  assert.ok(
    source.indexOf("await this.executeRevision") <
      source.indexOf('await stage("research")'),
  );
});

test("workspace exposes focused recovery only for a safely repairable source mismatch", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../routes/campaigns.ts", import.meta.url), "utf8"),
  );
  const route = source.slice(
    source.indexOf('router.get("/campaigns/:id/workspace"'),
    source.indexOf('router.get("/campaigns/:id"'),
  );
  assert.match(route, /reviewReason: latestValidation\.reason/);
  assert.match(route, /latestValidation\.repairable/);
  assert.match(route, /revisionRecovery/);
  assert.match(route, /SOURCE_REPAIR_EXPLANATION/);
});

test("legacy rebuild action routes a safely repairable draft through focused revision", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../routes/campaigns.ts", import.meta.url), "utf8"),
  );
  const route = source.slice(
    source.indexOf('router.post("/campaigns/:id/rebuild"'),
    source.indexOf('router.post("/campaigns/:id/run-team"'),
  );
  assert.match(route, /repairableRunBehindFailures/);
  assert.match(route, /customerRevision:\s*\{/);
  assert.match(route, /previousRunId: repairSource\.id/);
  assert.match(route, /priorQualityFeedback/);
  assert.match(route, /sourceRunId: repairSource\.id/);
  assert.match(route, /allowFailedSuccessors/);
  assert.match(route, /terminalQualityRebuildIdempotencyKey/);
  assert.match(route, /isTerminalQualityRebuildRun/);
  assert.match(route, /latest\.status === "failed" \|\| !terminalValidation\.valid/);
  assert.match(route, /finalizeTerminalQualityDraft/);
  assert.ok(
    route.indexOf("canRecoverCampaignRun") <
      route.indexOf("if (repairSource)"),
  );
  assert.ok(
    route.indexOf("ownedWebsiteImportMatchesCampaign") <
      route.indexOf("if (repairSource)"),
  );
});
