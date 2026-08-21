/**
 * Auto-timeout stale renders.
 *
 * Any project stuck in "processing" longer than 3× the model's estimated
 * render time is considered dead — the fal.ai request likely failed silently,
 * the API key was rotated, or the job was lost. We mark it failed and refund
 * the user's credits so they can retry immediately.
 *
 * Safety guarantees:
 *   - The status transition AND the credit refund happen inside a single
 *     database transaction. A process failure between them cannot leave a
 *     project permanently failed without a refund.
 *   - The transition is conditional: we only update rows still in "processing".
 *     If a webhook or poll completed/failed the row first, the UPDATE matches
 *     zero rows and we skip the refund, preventing double-credit.
 *   - The credit refund uses a relative SQL increment so overlapping interval
 *     executions cannot double-add from a stale read.
 *
 * Call once on startup and then every INTERVAL_MS to self-heal without a restart.
 */

import { creditLedgerTable, db, projectsTable, usersTable } from "@workspace/db";
import { eq, and, sql, isNull } from "drizzle-orm";
import { logger } from "./logger";
import { MODEL_RENDER_ESTIMATE } from "./falvideo";

// Run every 15 minutes
const INTERVAL_MS = 15 * 60 * 1000;

// Multiplier: if the render takes this much longer than expected, give up
const TIMEOUT_MULTIPLIER = 3;

// Fallback if model isn't in the table (shouldn't happen, but be safe)
const DEFAULT_ESTIMATE_SEC = 300; // 5 min

function timeoutSecondsForModel(modelId: string): number {
  const estimate = MODEL_RENDER_ESTIMATE[modelId] ?? DEFAULT_ESTIMATE_SEC;
  return estimate * TIMEOUT_MULTIPLIER;
}

export async function autoFailStuckRenders(): Promise<void> {
  try {
    const processing = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.status, "processing"));

    if (processing.length === 0) return;

    const now = Date.now();
    const stale = processing.filter((p) => {
      // Skip projects in the "narration/archival in progress" state.
      // These rows have no fal token (thumbnailUrl cleared) but hold a fal.media
      // URL in videoUrl — meaning the render is done and the narration+archive job
      // is running.  The timeout watcher must not kill them; the archival job owns
      // the final status transition and will fail+refund if it crashes.
      const isNarrating =
        !p.thumbnailUrl &&
        p.videoUrl != null &&
        !p.videoUrl.startsWith("/api/storage/");
      if (isNarrating) return false;

      const timeoutSec = timeoutSecondsForModel(p.renderingModelId ?? "ovi");
      const ageMs = now - new Date(p.updatedAt).getTime();
      return ageMs > timeoutSec * 1000;
    });

    if (stale.length === 0) return;

    logger.warn({ count: stale.length }, "[render-timeout] Auto-failing stale renders");

    for (const project of stale) {
      const ageMinutes = Math.round(
        (now - new Date(project.updatedAt).getTime()) / 60_000
      );
      logger.warn(
        { projectId: project.id, model: project.renderingModelId, ageMinutes },
        "[render-timeout] Marking failed"
      );

      const creditCost = project.creditCharge;

      // Atomic: transition status and refund credits in one transaction.
      // If the project was already resolved by a poll/webhook, the conditional
      // UPDATE returns zero rows and we skip the refund entirely.
      let won = false;
      await db.transaction(async (tx) => {
        const updated = await tx
          .update(projectsTable)
          .set({ status: "failed", refundedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(projectsTable.id, project.id),
              isNull(projectsTable.refundedAt),
              eq(projectsTable.status, "processing")
            )
          )
          .returning({ id: projectsTable.id });

        if (updated.length === 0) return; // Race: already resolved elsewhere
        won = true;

        // Atomic relative credit increment; skip admins
        const balance = await tx
          .update(usersTable)
          .set({ credits: sql`${usersTable.credits} + ${creditCost}` })
          .where(
            and(
              eq(usersTable.id, project.userId),
              sql`${usersTable.isAdmin} = false`
            )
          )
          .returning({ credits: usersTable.credits });
        if (balance[0]) {
          await tx.insert(creditLedgerTable).values({
            userId: project.userId, projectId: project.id, kind: "refund",
            amount: creditCost, balanceAfter: balance[0].credits,
          });
        }
      });

      if (won) {
        logger.info(
          { projectId: project.id, userId: project.userId, creditsRefunded: creditCost },
          "[render-timeout] Marked failed and credits refunded"
        );
        // Send/queue the failure notification — same path as fal webhook
        const [owner] = await db.select().from(usersTable)
          .where(eq(usersTable.id, project.userId));
        if (owner) {
          import("./email").then(({ sendRenderFailedEmail }) =>
            sendRenderFailedEmail(
              owner.email, owner.name ?? "", project.title, project.id, creditCost
            ).catch(() => {})
          );
        }
      } else {
        logger.info(
          { projectId: project.id },
          "[render-timeout] Race: project already resolved, skipping"
        );
      }
    }
  } catch (err) {
    // Non-fatal — log and move on
    logger.error({ err }, "[render-timeout] Error during stale render check");
  }
}

export function startRenderTimeoutWatcher(): void {
  // Run immediately on startup
  autoFailStuckRenders();
  // Then every INTERVAL_MS
  const timer = setInterval(autoFailStuckRenders, INTERVAL_MS);
  // Don't prevent clean shutdown
  timer.unref();
}
