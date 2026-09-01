import { isCompletedQualityReviewDraft } from "./campaignReview";

export type QueueCampaign = { id: string; user_id: string };
const RESUMABLE_FAILURE_CODES = new Set([
  "PROVIDER_RATE_LIMIT",
  "PROVIDER_UNAVAILABLE",
  "TEMPORARY_INFRASTRUCTURE_FAILURE",
]);
const MANUAL_RESUMABLE_FAILURE_CODES = new Set([
  "SCHEMA_REPAIR_EXHAUSTED",
  "PIPELINE_PERMANENT_FAILURE",
]);
const MANUAL_RESUME_MARKER = ":manual-resume-v1";
type Db = {
  connect(): Promise<{
    query(sql: string, values?: unknown[]): Promise<{ rows: any[] }>;
    release(): void;
  }>;
};

export function isResumableCampaignFailure(run: any) {
  const retryCount = Number(run?.retry_count);
  const alreadyManuallyResumed =
    typeof run?.idempotency_key === "string" &&
    run.idempotency_key.includes(MANUAL_RESUME_MARKER);
  return Boolean(
    run?.status === "failed" &&
      !alreadyManuallyResumed &&
      ((RESUMABLE_FAILURE_CODES.has(run.failure_code) && retryCount >= 3) ||
        (MANUAL_RESUMABLE_FAILURE_CODES.has(run.failure_code) &&
          retryCount >= 1)),
  );
}

export async function resumeFailedCampaignRun(
  db: Db,
  args: { campaign: QueueCampaign; runId: string; concurrencyLimit: number },
) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `campaign-user:${args.campaign.user_id}`,
    ]);
    const latest = (
      await client.query(
        "SELECT * FROM campaign_runs WHERE campaign_id=$1 ORDER BY run_number DESC LIMIT 1 FOR UPDATE",
        [args.campaign.id],
      )
    ).rows[0];
    if (!latest || latest.id !== args.runId) {
      await client.query("ROLLBACK");
      return { kind: "superseded" as const };
    }
    if (["queued", "running"].includes(latest.status)) {
      await client.query("COMMIT");
      return { kind: "existing" as const, run: latest };
    }
    if (!isResumableCampaignFailure(latest)) {
      await client.query("ROLLBACK");
      return { kind: "blocked" as const, run: latest };
    }
    const active = await client.query(
      "SELECT r.* FROM campaign_runs r JOIN campaigns c ON c.id=r.campaign_id WHERE c.user_id=$1 AND r.status IN ('queued','running') LIMIT $2",
      [args.campaign.user_id, args.concurrencyLimit],
    );
    if (active.rows.length >= args.concurrencyLimit) {
      await client.query("ROLLBACK");
      return { kind: "conflict" as const, activeRun: active.rows[0] };
    }
    const resumed = (
      await client.query(
        `UPDATE campaign_runs
         SET status='queued', current_stage='resuming', failure_code=NULL,
           idempotency_key=CASE
             WHEN POSITION($3 IN idempotency_key)=0
               THEN idempotency_key || $3
             ELSE idempotency_key
           END,
           queued_at=NOW(), completed_at=NULL, lease_owner=NULL,
           lease_expires_at=NULL, heartbeat_at=NULL, updated_at=NOW()
         WHERE id=$1 AND campaign_id=$2 AND status='failed'
         RETURNING *`,
        [args.runId, args.campaign.id, MANUAL_RESUME_MARKER],
      )
    ).rows[0];
    if (!resumed) {
      await client.query("ROLLBACK");
      return { kind: "superseded" as const };
    }
    await client.query(
      "UPDATE campaigns SET status='queued',updated_at=NOW() WHERE id=$1",
      [args.campaign.id],
    );
    await client.query("COMMIT");
    return { kind: "resumed" as const, run: resumed };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function queueCampaignRun(
  db: Db,
  args: {
    campaign: QueueCampaign;
    idempotencyKey: string;
    contextSnapshot: unknown;
    revisionNotes?: string | null;
    sourceRunId?: string;
    allowFailedSuccessors?: boolean;
    concurrencyLimit: number;
  },
) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `campaign-user:${args.campaign.user_id}`,
    ]);
    if (args.sourceRunId) {
      const latest = (
        await client.query(
          "SELECT * FROM campaign_runs WHERE campaign_id=$1 ORDER BY run_number DESC LIMIT 1 FOR UPDATE",
          [args.campaign.id],
        )
      ).rows[0];
      let sourceIsSafe = Boolean(
        latest &&
          latest.id === args.sourceRunId &&
          (["ready_for_review", "needs_revision"].includes(latest.status) ||
            isCompletedQualityReviewDraft(latest)),
      );
      if (!sourceIsSafe && args.allowFailedSuccessors) {
        sourceIsSafe = Boolean(
          (
            await client.query(
              `SELECT source.id FROM campaign_runs source
               WHERE source.campaign_id=$1 AND source.id=$2
                 AND (
                   source.status IN ('ready_for_review','needs_revision') OR
                   (
                     source.status='failed' AND
                     source.current_stage='quality_review_failed' AND
                     source.failure_code IS NULL AND
                     COALESCE(source.retry_count,0)=0 AND
                     source.qa_status='failed' AND
                     source.idempotency_key LIKE 'failed-recovery:owned-context-v4:%' AND
                     source.final_result IS NOT NULL
                   )
                 )
                 AND NOT EXISTS (
                   SELECT 1 FROM campaign_runs newer
                   WHERE newer.campaign_id=source.campaign_id
                     AND newer.run_number>source.run_number
                     AND newer.status<>'failed'
                 )
               FOR UPDATE`,
              [args.campaign.id, args.sourceRunId],
            )
          ).rows[0],
        );
      }
      if (!sourceIsSafe) {
        await client.query("ROLLBACK");
        return { kind: "superseded" as const };
      }
    }
    const same = (
      await client.query(
        "SELECT * FROM campaign_runs WHERE campaign_id=$1 AND idempotency_key=$2",
        [args.campaign.id, args.idempotencyKey],
      )
    ).rows[0];
    if (same) {
      await client.query("COMMIT");
      return { kind: "existing" as const, run: same };
    }
    const active = await client.query(
      "SELECT r.* FROM campaign_runs r JOIN campaigns c ON c.id=r.campaign_id WHERE c.user_id=$1 AND r.status IN ('queued','running') LIMIT $2",
      [args.campaign.user_id, args.concurrencyLimit],
    );
    if (active.rows.length >= args.concurrencyLimit) {
      await client.query("ROLLBACK");
      return { kind: "conflict" as const, activeRun: active.rows[0] };
    }
    const run = (
      await client.query(
        `INSERT INTO campaign_runs(id,campaign_id,run_number,idempotency_key,context_snapshot,customer_revision_notes) SELECT $1,$2,COALESCE(MAX(run_number),0)+1,$3,$4,$5 FROM campaign_runs WHERE campaign_id=$2 RETURNING *`,
        [
          crypto.randomUUID(),
          args.campaign.id,
          args.idempotencyKey,
          args.contextSnapshot,
          args.revisionNotes ?? null,
        ],
      )
    ).rows[0];
    if (!run) throw new Error("RUN_NOT_CREATED");
    await client.query(
      "UPDATE campaigns SET status='queued',updated_at=NOW() WHERE id=$1",
      [args.campaign.id],
    );
    await client.query("COMMIT");
    return { kind: "created" as const, run };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
