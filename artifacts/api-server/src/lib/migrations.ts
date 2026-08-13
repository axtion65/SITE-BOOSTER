import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { logger } from "./logger";

type MigrationPool = { connect(): Promise<{ query<T = any>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>; release(): void }> };

const MIGRATION_LOCK = 715202601;
export async function runSqlMigrations(pool: MigrationPool, directory = new URL("./migrations/", import.meta.url)) {
  const files = (await readdir(directory)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
  if (!files.length) throw new Error("No SQL migrations were bundled");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    for (const filename of files) {
      const sql = await readFile(new URL(filename, directory), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query<{ checksum: string }>("SELECT checksum FROM schema_migrations WHERE filename=$1", [filename]);
      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== checksum) throw new Error(`Migration checksum mismatch: ${filename}`);
        continue;
      }
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(filename, checksum) VALUES ($1,$2)", [filename, checksum]);
      logger.info({ filename }, "Applied SQL migration");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}
