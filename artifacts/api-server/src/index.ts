import app from "./app";
import { logger } from "./lib/logger";
import { startRenderTimeoutWatcher } from "./lib/renderTimeout";
import { startEmailQueueWorker } from "./lib/emailQueueWorker";
import { pool } from "@workspace/db";

// Idempotent schema migration — runs before the server accepts requests.
// Ensures email_queue exists even in fresh deployments with no prior migration.
async function runStartupMigrations() {
  await pool.query(`
    ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS voice_id TEXT;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_queue (
      id TEXT PRIMARY KEY,
      "to" TEXT NOT NULL,
      to_name TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL,
      html TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ
    );
  `);
  logger.info("DB migrations OK");
}

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT: "${rawPort}"`);

if (!process.env.SESSION_SECRET) {
  logger.error("SESSION_SECRET is required — refusing to start without it");
  process.exit(1);
}

if (!process.env.STRIPE_API_KEY) {
  logger.warn("STRIPE_API_KEY not set — billing endpoints will fail");
}

// Run idempotent migrations before accepting traffic
await runStartupMigrations();

const server = app.listen(port, (err) => {
  if (err) { logger.error({ err }, "Error listening on port"); process.exit(1); }
  logger.info({ port }, "Server listening");
  // Auto-fail renders stuck past 3× their expected render time and refund credits
  startRenderTimeoutWatcher();
  // Retry pending emails on a bounded-backoff schedule
  startEmailQueueWorker();
});

// Graceful shutdown — release the port cleanly before the process exits.
// Without this, Replit restarts cause EADDRINUSE and the server fails to come back up.
function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down gracefully");
  server.close(() => {
    logger.info("Server closed — exiting");
    process.exit(0);
  });
  // Force-exit after 5s if connections don't drain
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
