/**
 * Background email-queue worker.
 *
 * Runs once per POLL_INTERVAL and retries every eligible pending row,
 * using per-row bounded exponential backoff so a broken provider does
 * not spam Resend's rate-limit endpoint.
 *
 * Backoff schedule (based on attempts already made):
 *   0 previous attempts → eligible immediately (first try by sendEmail already failed)
 *   1 attempt  → wait  5 min
 *   2 attempts → wait 10 min
 *   3 attempts → wait 20 min
 *   4 attempts → wait 40 min
 *   5+ attempts → wait  6 h (cap)
 *
 * The worker only logs; it never throws.  If the DB is unavailable the
 * tick is skipped silently and the interval continues.
 */

import { logger } from "./logger";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes

function backoffMs(attempts: number): number {
  if (attempts <= 0) return 0;
  const base = 5 * 60 * 1000; // 5 min
  const cap  = 6 * 60 * 60 * 1000; // 6 h
  return Math.min(base * Math.pow(2, attempts - 1), cap);
}

// How long a "processing" row is allowed to stay before we assume the worker
// that claimed it crashed and reset it back to "pending"
const STUCK_PROCESSING_TIMEOUT_MS = 10 * 60 * 1000; // 10 min

async function tick() {
  try {
    const { db, emailQueueTable } = await import("@workspace/db");
    const { eq, and, lte } = await import("drizzle-orm");

    // Un-stick rows that stayed in "processing" longer than the timeout.
    // This happens when a worker crashes after claiming a row but before
    // marking it sent/pending/failed.
    const stuckCutoff = new Date(Date.now() - STUCK_PROCESSING_TIMEOUT_MS);
    await db.update(emailQueueTable)
      .set({ status: "pending", updatedAt: new Date() })
      .where(and(eq(emailQueueTable.status, "processing"), lte(emailQueueTable.updatedAt, stuckCutoff)));

    // Only retry rows that are explicitly "pending" — failed rows require
    // explicit administrator action (POST /admin/email-queue/retry-all) to reset.
    const rows = await db.select().from(emailQueueTable)
      .where(eq(emailQueueTable.status, "pending"));

    if (rows.length === 0) return;

    const now = Date.now();
    const eligible = rows.filter((r) => {
      const wait = backoffMs(r.attempts);
      const lastTry = r.updatedAt?.getTime() ?? r.createdAt.getTime();
      return now - lastTry >= wait;
    });

    if (eligible.length === 0) return;

    logger.info({ count: eligible.length }, "[email-worker] Retrying pending emails");

    const { retryQueuedEmail } = await import("./email");
    let sent = 0;
    for (const row of eligible) {
      try {
        const result = await retryQueuedEmail(row.id);
        if (result.ok) sent++;
      } catch (err) {
        logger.warn({ id: row.id, err }, "[email-worker] Per-row retry error");
      }
    }

    logger.info({ attempted: eligible.length, sent }, "[email-worker] Tick complete");
  } catch (err) {
    logger.warn({ err }, "[email-worker] Tick failed — will retry next interval");
  }
}

export function startEmailQueueWorker() {
  // Run once shortly after startup (let server settle), then on interval
  const warmup = setTimeout(() => tick(), 60_000); // 1-min warm-up
  const interval = setInterval(() => tick(), POLL_INTERVAL_MS);

  // Allow Node to exit cleanly — these timers must not block shutdown
  warmup.unref();
  interval.unref();

  logger.info("[email-worker] Started (poll every 5 min, 1 min warm-up)");
}
