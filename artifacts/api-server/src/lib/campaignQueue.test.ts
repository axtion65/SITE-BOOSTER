import assert from "node:assert/strict";
import test from "node:test";
import { queueCampaignRun } from "./campaignQueue";

function fakeDb() {
  const runs: any[] = [];
  let locked = Promise.resolve();
  return {
    runs,
    async connect() {
      let unlock!: () => void;
      const previous = locked;
      locked = new Promise<void>((resolve) => (unlock = resolve));
      await previous;
      return {
        release: unlock,
        async query(sql: string, values: any[] = []) {
          if (
            sql.includes("ORDER BY run_number DESC LIMIT 1 FOR UPDATE")
          ) {
            const latest = runs
              .filter((run) => run.campaign_id === values[0])
              .sort((a, b) => b.run_number - a.run_number)[0];
            return { rows: latest ? [latest] : [] };
          }
          if (
            sql.startsWith(
              "SELECT * FROM campaign_runs WHERE campaign_id=$1 AND idempotency_key=$2",
            )
          ) {
            return {
              rows: runs.filter(
                (run) =>
                  run.campaign_id === values[0] &&
                  run.idempotency_key === values[1],
              ),
            };
          }
          if (sql.startsWith("SELECT r.*")) {
            return {
              rows: runs
                .filter((run) => ["queued", "running"].includes(run.status))
                .slice(0, values[1]),
            };
          }
          if (sql.startsWith("INSERT INTO campaign_runs")) {
            const previousRuns = runs.filter(
              (run) => run.campaign_id === values[1],
            );
            const run = {
              id: values[0],
              campaign_id: values[1],
              idempotency_key: values[2],
              status: "queued",
              run_number:
                Math.max(0, ...previousRuns.map((item) => item.run_number)) + 1,
            };
            runs.push(run);
            return { rows: [run] };
          }
          return { rows: [] };
        },
      };
    },
  };
}

test("same idempotency key returns exactly the same run", async () => {
  const db = fakeDb();
  const args = {
    campaign: { id: "c1", user_id: "u1" },
    idempotencyKey: "same",
    contextSnapshot: {},
    concurrencyLimit: 1,
  };
  const first = await queueCampaignRun(db, args);
  const second = await queueCampaignRun(db, args);
  assert.equal(first.run.id, second.run.id);
  assert.equal(db.runs.length, 1);
});

test("simultaneous different clicks cannot bypass user concurrency", async () => {
  const db = fakeDb();
  const base = {
    campaign: { id: "c1", user_id: "u1" },
    contextSnapshot: {},
    concurrencyLimit: 1,
  };
  const [first, second] = await Promise.all([
    queueCampaignRun(db, { ...base, idempotencyKey: "a" }),
    queueCampaignRun(db, {
      ...base,
      campaign: { id: "c2", user_id: "u1" },
      idempotencyKey: "b",
    }),
  ]);
  assert.deepEqual([first.kind, second.kind].sort(), ["conflict", "created"]);
  assert.equal(db.runs.length, 1);
});

test("latest needs_revision run can be used as a revision source", async () => {
  const db = fakeDb();
  db.runs.push({
    id: "needs-revision-run",
    campaign_id: "c1",
    idempotency_key: "original",
    status: "needs_revision",
    run_number: 1,
  });

  const result = await queueCampaignRun(db, {
    campaign: { id: "c1", user_id: "u1" },
    idempotencyKey: "revision-1",
    contextSnapshot: {},
    revisionNotes: "Fix the unsupported price modifier",
    sourceRunId: "needs-revision-run",
    concurrencyLimit: 1,
  });

  assert.equal(result.kind, "created");
  assert.equal(db.runs.length, 2);
  assert.equal(db.runs[1].run_number, 2);
});

test("latest ready_for_review run can still be used as a revision source", async () => {
  const db = fakeDb();
  db.runs.push({
    id: "review-run",
    campaign_id: "c1",
    idempotency_key: "original",
    status: "ready_for_review",
    run_number: 1,
  });

  const result = await queueCampaignRun(db, {
    campaign: { id: "c1", user_id: "u1" },
    idempotencyKey: "revision-1",
    contextSnapshot: {},
    revisionNotes: "Make the hook stronger",
    sourceRunId: "review-run",
    concurrencyLimit: 1,
  });

  assert.equal(result.kind, "created");
});

test("stale revision source remains superseded", async () => {
  const db = fakeDb();
  db.runs.push(
    {
      id: "old-run",
      campaign_id: "c1",
      idempotency_key: "old",
      status: "needs_revision",
      run_number: 1,
    },
    {
      id: "latest-run",
      campaign_id: "c1",
      idempotency_key: "latest",
      status: "needs_revision",
      run_number: 2,
    },
  );

  const result = await queueCampaignRun(db, {
    campaign: { id: "c1", user_id: "u1" },
    idempotencyKey: "revision-1",
    contextSnapshot: {},
    revisionNotes: "Attempt stale revision",
    sourceRunId: "old-run",
    concurrencyLimit: 1,
  });

  assert.equal(result.kind, "superseded");
  assert.equal(db.runs.length, 2);
});
