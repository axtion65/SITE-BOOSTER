import app from "./app";
import { logger } from "./lib/logger";
import { startRenderTimeoutWatcher } from "./lib/renderTimeout";
import { startEmailQueueWorker } from "./lib/emailQueueWorker";
import { startCampaignWorker } from "./lib/campaignWorker";
import { startMockupWorker } from "./lib/mockupWorker";
import { pool } from "@workspace/db";
import { bootstrapAdminFromEnvironment } from "./lib/adminBootstrap";
import { runSqlMigrations } from "./lib/migrations";
import { verifyMockupPersistenceBeforeTraffic } from "./lib/mockupPersistenceInvariant";
import { startVideoProductionWorker } from "./lib/videoProduction";

// Idempotent schema migration — runs before the server accepts requests.
// Safe to run on every startup: CREATE/ALTER IF NOT EXISTS never destroys data.
async function runStartupMigrations() {
  // ── users ──────────────────────────────────────────────────────────────────
  // Create the full table on a fresh database; existing databases skip this.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id                    TEXT PRIMARY KEY,
      email                 TEXT NOT NULL UNIQUE,
      name                  TEXT,
      password_hash         TEXT NOT NULL,
      plan                  TEXT NOT NULL DEFAULT 'free',
      credits               INTEGER NOT NULL DEFAULT 90,
      stripe_customer_id    TEXT,
      stripe_subscription_id TEXT,
      is_admin              BOOLEAN NOT NULL DEFAULT FALSE,
      account_status        TEXT NOT NULL DEFAULT 'active',
      subscription_status   TEXT,
      billing_interval      TEXT,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).catch((err: any) => {
    logger.error({ pg_code: err.code, pg_detail: err.detail, err }, "Migration failed: CREATE users");
    throw err;
  });

  // Back-fill columns that were added after the initial deploy.
  // Each statement is safe to run when the column already exists.
  const userAlters: string[] = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 90`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_interval TEXT`,
  ];
  for (const sql of userAlters) {
    await pool.query(sql).catch((err: any) => {
      logger.error({ pg_code: err.code, pg_detail: err.detail, sql, err }, "Migration failed: ALTER users");
      throw err;
    });
  }

  // ── projects ───────────────────────────────────────────────────────────────
  // Create with all columns for fresh deployments.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id                 TEXT PRIMARY KEY,
      user_id            TEXT NOT NULL,
      title              TEXT NOT NULL,
      description        TEXT,
      status             TEXT NOT NULL DEFAULT 'draft',
      rendering_model_id TEXT NOT NULL DEFAULT 'ovi',
      script             TEXT,
      expanded_script    TEXT,
      platform           TEXT,
      duration           TEXT,
      video_url          TEXT,
      thumbnail_url      TEXT,
      template_id        TEXT,
      product_image_url  TEXT,
      voice_id           TEXT,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).catch((err: any) => {
    logger.error({ pg_code: err.code, pg_detail: err.detail, err }, "Migration failed: CREATE projects");
    throw err;
  });

  // Back-fill columns added after initial deploy on existing databases.
  const projectAlters: string[] = [
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS rendering_model_id TEXT NOT NULL DEFAULT 'ovi'`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS expanded_script TEXT`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS platform TEXT`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS duration TEXT`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS video_url TEXT`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS template_id TEXT`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS product_image_url TEXT`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS voice_id TEXT`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  ];
  for (const sql of projectAlters) {
    await pool.query(sql).catch((err: any) => {
      logger.error({ pg_code: err.code, pg_detail: err.detail, sql, err }, "Migration failed: ALTER projects");
      throw err;
    });
  }

  // ── email_queue ────────────────────────────────────────────────────────────
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
  `).catch((err: any) => {
    logger.error({ pg_code: err.code, pg_detail: err.detail, err }, "Migration failed: CREATE email_queue");
    throw err;
  });

  // Canonical, checksummed SQL migrations are serialized by advisory lock.
  await runSqlMigrations(pool);

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

const falKey = process.env.FAL_KEY?.trim();
if (!falKey) {
  logger.error({ event: "mockup_provider_configuration_invalid", provider: "fal" }, "FAL_KEY is required — refusing to accept paid generation traffic");
  process.exit(1);
}
logger.info({ event: "mockup_provider_configuration_verified", provider: "fal" }, "Mockup provider configuration present");

// Run idempotent migrations before accepting traffic
await runStartupMigrations();
await verifyMockupPersistenceBeforeTraffic(pool);

// Optional, narrowly-scoped deployment bootstrap. This runs before traffic is
// accepted and can only promote the one existing account named by the env var.
await bootstrapAdminFromEnvironment();

const server = app.listen(port, (err) => {
  if (err) { logger.error({ err }, "Error listening on port"); process.exit(1); }
  logger.info({ port }, "Server listening");
  // Auto-fail renders stuck past 3× their expected render time and refund credits
  startRenderTimeoutWatcher();
  // Retry pending emails on a bounded-backoff schedule
  startEmailQueueWorker();
  startCampaignWorker();
  startMockupWorker();
  startVideoProductionWorker();
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
