import { randomUUID } from "node:crypto";
import { logger } from "./logger";

type QueryClient = {
  query<T = any>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
  release(): void;
};

type QueryPool = { connect(): Promise<QueryClient> };

export async function verifyMockupPersistenceBeforeTraffic(pool: QueryPool) {
  const client = await pool.connect();
  try {
    const relation = await client.query<{
      child_oid: string | null;
      parent_oid: string | null;
      constraint_parent_oid: string | null;
      delete_action: string | null;
      validated: boolean | null;
    }>(`
      SELECT
        to_regclass('mockup_versions')::oid::text AS child_oid,
        to_regclass('mockup_projects')::oid::text AS parent_oid,
        c.confrelid::text AS constraint_parent_oid,
        c.confdeltype AS delete_action,
        c.convalidated AS validated
      FROM pg_constraint c
      WHERE c.conrelid = to_regclass('mockup_versions')
        AND c.conname = 'mockup_versions_mockup_project_id_fkey'
    `);
    const metadata = relation.rows[0];
    if (
      !metadata ||
      !metadata.child_oid ||
      !metadata.parent_oid ||
      metadata.constraint_parent_oid !== metadata.parent_oid ||
      metadata.delete_action !== "c" ||
      metadata.validated !== true
    ) {
      throw new Error("mockup_persistence_constraint_invariant_failed");
    }

    const sample = await client.query<{ id: string; next_version: number }>(`
      SELECT mp.id,
             COALESCE(MAX(mv.version_number), 0)::int + 1 AS next_version
      FROM mockup_projects mp
      LEFT JOIN mockup_versions mv ON mv.mockup_project_id = mp.id
      GROUP BY mp.id
      ORDER BY mp.created_at DESC
      LIMIT 1
    `);
    if (!sample.rows[0]) {
      logger.info({ event: "mockup_persistence_probe_skipped_no_projects" });
      return;
    }

    await client.query("BEGIN");
    try {
      await client.query(
        "INSERT INTO mockup_versions(id,mockup_project_id,version_number,status) VALUES($1,$2,$3,'draft')",
        [`startup-probe-${randomUUID()}`, sample.rows[0].id, sample.rows[0].next_version],
      );
      await client.query("ROLLBACK");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
    logger.info({ event: "mockup_persistence_invariant_ok" });
  } finally {
    client.release();
  }
}
