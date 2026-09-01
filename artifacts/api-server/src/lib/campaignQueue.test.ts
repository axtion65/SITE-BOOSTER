import assert from "node:assert/strict";
import test from "node:test";
import {
  isResumableCampaignFailure,
  queueCampaignRun,
  resumeFailedCampaignRun,
} from "./campaignQueue";

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
          if (sql.includes("SELECT source.id FROM campaign_runs source")) {
            const source = runs.find(
              (run) =>
                run.campaign_id === values[0] &&
                run.id === values[1] &&
                (["ready_for_review", "needs_revision"].includes(run.status) ||
                  (run.status === "failed" &&
                    run.current_stage === "quality_review_failed" &&
                    run.failure_code == null &&
                    Number(run.retry_count ?? 0) === 0 &&
                    run.qa_status === "failed" &&
                    run.idempotency_key?.startsWith(
                      "failed-recovery:owned-context-v4:",
                    ) &&
                    run.final_result)),
            );
            const newerNonfailed = source
              ? runs.some(
                  (run) =>
                    run.campaign_id === source.campaign_id &&
                    run.run_number > source.run_number &&
                    run.status !== "failed",
                )
              : true;
            return { rows: source && !newerNonfailed ? [source] : [] };
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
          if (
            sql.includes("UPDATE campaign_runs") &&
            sql.includes("resuming")
          ) {
            const run = runs.find(
              (item) =>
                item.id === values[0] &&
                item.campaign_id === values[1] &&
                item.status === "failed",
            );
            if (!run) return { rows: [] };
            Object.assign(run, {
              status: "queued",
              current_stage: "resuming",
              failure_code: null,
              idempotency_key:
                typeof run.idempotency_key === "string" &&
                run.idempotency_key.includes(":manual-resume-v1")
                  ? run.idempotency_key
                  : `${run.idempotency_key ?? ""}:manual-resume-v1`,
              completed_at: null,
            });
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

test("an explicit repair source remains safe behind failed successors", async () => {
  const db = fakeDb();
  db.runs.push(
    {
      id: "repair-source",
      campaign_id: "c1",
      status: "needs_revision",
      run_number: 1,
    },
    { id: "failed-1", campaign_id: "c1", status: "failed", run_number: 2 },
    { id: "failed-2", campaign_id: "c1", status: "failed", run_number: 3 },
  );
  const result = await queueCampaignRun(db, {
    campaign: { id: "c1", user_id: "u1" },
    idempotencyKey: "focused-repair",
    contextSnapshot: {},
    sourceRunId: "repair-source",
    allowFailedSuccessors: true,
    concurrencyLimit: 1,
  });
  assert.equal(result.kind, "created");
  assert.equal(db.runs.at(-1)?.run_number, 4);
});

test("failed-successor recovery still rejects a newer active source", async () => {
  const db = fakeDb();
  db.runs.push(
    {
      id: "stale-source",
      campaign_id: "c1",
      status: "needs_revision",
      run_number: 1,
    },
    {
      id: "newer-source",
      campaign_id: "c1",
      status: "needs_revision",
      run_number: 2,
    },
    { id: "failed", campaign_id: "c1", status: "failed", run_number: 3 },
  );
  const result = await queueCampaignRun(db, {
    campaign: { id: "c1", user_id: "u1" },
    idempotencyKey: "unsafe-repair",
    contextSnapshot: {},
    sourceRunId: "stale-source",
    allowFailedSuccessors: true,
    concurrencyLimit: 1,
  });
  assert.equal(result.kind, "superseded");
  assert.equal(db.runs.length, 3);
});

test("completed quality-review recovery uses its saved draft without restarting", async () => {
  const db = fakeDb();
  db.runs.push({
    id: "quality-draft",
    campaign_id: "c1",
    status: "failed",
    current_stage: "quality_review_failed",
    failure_code: null,
    retry_count: 0,
    qa_status: "failed",
    idempotency_key: "failed-recovery:owned-context-v4:quality-draft:key",
    final_result: {
      finalScript: {
        title: "Saved title",
        hook: "Saved hook",
        script: "Saved script",
        callToAction: "Learn more",
      },
    },
    run_number: 3,
  });

  const result = await queueCampaignRun(db, {
    campaign: { id: "c1", user_id: "u1" },
    idempotencyKey: "focused-quality-repair",
    contextSnapshot: {},
    sourceRunId: "quality-draft",
    concurrencyLimit: 1,
  });

  assert.equal(result.kind, "created");
  assert.equal(db.runs.length, 2);
});

test("only an exhausted safe failure without a manual marker can resume", () => {
  assert.equal(
    isResumableCampaignFailure({
      status: "failed",
      failure_code: "PROVIDER_UNAVAILABLE",
      retry_count: 3,
    }),
    true,
  );
  assert.equal(
    isResumableCampaignFailure({
      status: "failed",
      failure_code: "SCHEMA_REPAIR_EXHAUSTED",
      retry_count: 1,
    }),
    true,
  );
  assert.equal(
    isResumableCampaignFailure({
      status: "failed",
      failure_code: "PIPELINE_PERMANENT_FAILURE",
      retry_count: 1,
    }),
    true,
  );
  assert.equal(
    isResumableCampaignFailure({
      status: "failed",
      failure_code: "INVALID_EVIDENCE_LEDGER",
      retry_count: 1,
    }),
    false,
  );
  assert.equal(
    isResumableCampaignFailure({
      status: "failed",
      failure_code: "PROVIDER_UNAVAILABLE",
      retry_count: 8,
    }),
    true,
  );
  assert.equal(
    isResumableCampaignFailure({
      status: "failed",
      failure_code: "PIPELINE_PERMANENT_FAILURE",
      retry_count: 6,
    }),
    true,
  );
  assert.equal(
    isResumableCampaignFailure({
      status: "failed",
      failure_code: "PIPELINE_PERMANENT_FAILURE",
      retry_count: 6,
      idempotency_key:
        "failed-recovery:owned-context-v4:run:key:manual-resume-v1",
    }),
    false,
  );
});

test("schema recovery resumes only the incomplete stage on the same run", async () => {
  const db = fakeDb();
  db.runs.push({
    id: "schema-run",
    campaign_id: "c1",
    status: "failed",
    failure_code: "SCHEMA_REPAIR_EXHAUSTED",
    retry_count: 1,
    idempotency_key: "failed-recovery:owned-context-v4:schema-run:key",
    run_number: 5,
  });

  const resumed = await resumeFailedCampaignRun(db, {
    campaign: { id: "c1", user_id: "u1" },
    runId: "schema-run",
    concurrencyLimit: 1,
  });

  assert.equal(resumed.kind, "resumed");
  assert.equal(resumed.run.id, "schema-run");
  assert.equal(db.runs.length, 1);

  resumed.run.status = "failed";
  resumed.run.failure_code = "SCHEMA_REPAIR_EXHAUSTED";
  resumed.run.retry_count = 99;
  assert.equal(
    (
      await resumeFailedCampaignRun(db, {
        campaign: { id: "c1", user_id: "u1" },
        runId: "schema-run",
        concurrencyLimit: 1,
      })
    ).kind,
    "blocked",
  );
});

test("manual recovery resumes the same run once instead of creating a run", async () => {
  const db = fakeDb();
  db.runs.push({
    id: "recovery-run",
    campaign_id: "c1",
    status: "failed",
    failure_code: "TEMPORARY_INFRASTRUCTURE_FAILURE",
    retry_count: 3,
    idempotency_key: "failed-recovery:owned-context-v4:recovery-run:key",
    run_number: 4,
  });

  const resumed = await resumeFailedCampaignRun(db, {
    campaign: { id: "c1", user_id: "u1" },
    runId: "recovery-run",
    concurrencyLimit: 1,
  });

  assert.equal(resumed.kind, "resumed");
  assert.equal(resumed.run.id, "recovery-run");
  assert.equal(resumed.run.status, "queued");
  assert.equal(db.runs.length, 1);

  resumed.run.status = "failed";
  resumed.run.failure_code = "TEMPORARY_INFRASTRUCTURE_FAILURE";
  resumed.run.retry_count = 99;
  assert.equal(
    (
      await resumeFailedCampaignRun(db, {
        campaign: { id: "c1", user_id: "u1" },
        runId: "recovery-run",
        concurrencyLimit: 1,
      })
    ).kind,
    "blocked",
  );
});

test("manual recovery preserves the account concurrency limit", async () => {
  const db = fakeDb();
  db.runs.push(
    {
      id: "recovery-run",
      campaign_id: "c1",
      status: "failed",
      failure_code: "PROVIDER_RATE_LIMIT",
      retry_count: 3,
      run_number: 1,
    },
    {
      id: "other-active-run",
      campaign_id: "c2",
      status: "running",
      run_number: 1,
    },
  );

  const result = await resumeFailedCampaignRun(db, {
    campaign: { id: "c1", user_id: "u1" },
    runId: "recovery-run",
    concurrencyLimit: 1,
  });

  assert.equal(result.kind, "conflict");
  assert.equal(db.runs[0].status, "failed");
});
