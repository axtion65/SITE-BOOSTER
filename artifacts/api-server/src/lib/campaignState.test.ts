import assert from "node:assert/strict";
import test from "node:test";
import {
  approveLatestCampaignRun,
  validateLatestRevisionSource,
} from "./campaignState";

function stateDb(runs: any[]) {
  let campaign: any = {
    id: "campaign",
    user_id: "owner",
    status: "ready_for_review",
  };
  return {
    get campaign() {
      return campaign;
    },
    async connect() {
      return {
        release() {},
        async query(sql: string, values: any[] = []) {
          if (sql.startsWith("SELECT * FROM campaigns"))
            return { rows: values[1] === "owner" ? [campaign] : [] };
          if (sql.startsWith("SELECT * FROM campaign_runs"))
            return {
              rows: [...runs]
                .sort((a, b) => b.run_number - a.run_number)
                .slice(0, 1),
            };
          if (sql.startsWith("UPDATE campaigns")) {
            campaign = {
              ...campaign,
              approved_run_id: values[1],
              status: "approved",
            };
            return { rows: [campaign] };
          }
          return { rows: [] };
        },
      };
    },
  };
}

test("stale approval and stale revision sources are rejected", async () => {
  const db = stateDb([
    { id: "old", run_number: 1, status: "ready_for_review" },
    { id: "new", run_number: 2, status: "queued" },
  ]);
  assert.equal(
    (
      await approveLatestCampaignRun(db, {
        campaignId: "campaign",
        userId: "owner",
        runId: "old",
      })
    ).kind,
    "superseded",
  );
  assert.equal(
    (
      await validateLatestRevisionSource(db, {
        campaignId: "campaign",
        userId: "owner",
        runId: "old",
      })
    ).kind,
    "superseded",
  );
});

test("latest review-ready run can be approved", async () => {
  const db = stateDb([
    { id: "latest", run_number: 2, status: "ready_for_review" },
  ]);
  const result = await approveLatestCampaignRun(db, {
    campaignId: "campaign",
    userId: "owner",
    runId: "latest",
  });
  assert.equal(result.kind, "approved");
  assert.equal(db.campaign.approved_run_id, "latest");
});

for (const status of ["ready_for_review", "needs_revision"]) {
  test(`latest ${status} run can be a revision source`, async () => {
    const db = stateDb([{ id: "latest", run_number: 2, status }]);
    const result = await validateLatestRevisionSource(db, {
      campaignId: "campaign",
      userId: "owner",
      runId: "latest",
    });
    assert.equal(result.kind, "current");
  });
}

for (const status of ["queued", "running", "approved", "failed"]) {
  test(`${status} run cannot be a revision source`, async () => {
    const db = stateDb([{ id: "latest", run_number: 2, status }]);
    const result = await validateLatestRevisionSource(db, {
      campaignId: "campaign",
      userId: "owner",
      runId: "latest",
    });
    assert.equal(result.kind, "superseded");
  });
}

test("needs-revision run cannot be approved", async () => {
  const db = stateDb([
    { id: "latest", run_number: 2, status: "needs_revision" },
  ]);
  const result = await approveLatestCampaignRun(db, {
    campaignId: "campaign",
    userId: "owner",
    runId: "latest",
  });
  assert.equal(result.kind, "superseded");
  assert.equal(db.campaign.approved_run_id, undefined);
});


test("duplicate approval is idempotent after persistence", async () => {
  const db = stateDb([{ id: "latest", run_number: 2, status: "ready_for_review" }]);
  const args={campaignId:"campaign",userId:"owner",runId:"latest"};
  assert.equal((await approveLatestCampaignRun(db,args)).kind,"approved");
  assert.equal((await approveLatestCampaignRun(db,args)).kind,"approved");
  assert.equal(db.campaign.approved_run_id,"latest");
});
