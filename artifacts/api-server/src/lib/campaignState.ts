type StateDb = {
  connect(): Promise<{
    query(sql: string, values?: unknown[]): Promise<{ rows: any[] }>;
    release(): void;
  }>;
};

async function withLockedCampaign<T>(
  db: StateDb,
  campaignId: string,
  userId: string,
  operation: (
    client: Awaited<ReturnType<StateDb["connect"]>>,
    campaign: any,
  ) => Promise<T>,
) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const campaign = (
      await client.query(
        "SELECT * FROM campaigns WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [campaignId, userId],
      )
    ).rows[0];
    if (!campaign) {
      await client.query("ROLLBACK");
      return { kind: "not_found" as const };
    }
    const result = await operation(client, campaign);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function approveLatestCampaignRun(
  db: StateDb,
  args: { campaignId: string; userId: string; runId: string },
) {
  return withLockedCampaign(
    db,
    args.campaignId,
    args.userId,
    async (client) => {
      const latest = (
        await client.query(
          "SELECT * FROM campaign_runs WHERE campaign_id=$1 ORDER BY run_number DESC LIMIT 1 FOR UPDATE",
          [args.campaignId],
        )
      ).rows[0];
      if (
        !latest ||
        latest.id !== args.runId ||
        latest.status !== "ready_for_review"
      )
        return { kind: "superseded" as const };
      const campaign = (
        await client.query(
          "UPDATE campaigns SET approved_run_id=$2,status='approved',updated_at=NOW() WHERE id=$1 RETURNING *",
          [args.campaignId, args.runId],
        )
      ).rows[0];
      return { kind: "approved" as const, campaign };
    },
  );
}

export function validateLatestRevisionSource(
  db: StateDb,
  args: { campaignId: string; userId: string; runId: string },
) {
  return withLockedCampaign(
    db,
    args.campaignId,
    args.userId,
    async (client, campaign) => {
      const latest = (
        await client.query(
          "SELECT * FROM campaign_runs WHERE campaign_id=$1 ORDER BY run_number DESC LIMIT 1 FOR UPDATE",
          [args.campaignId],
        )
      ).rows[0];
      if (
        !latest ||
        latest.id !== args.runId ||
        !["ready_for_review", "needs_revision"].includes(latest.status)
      )
        return { kind: "superseded" as const };
      return { kind: "current" as const, campaign };
    },
  );
}
