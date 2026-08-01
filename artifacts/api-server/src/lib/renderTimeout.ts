/**
 * Auto-timeout stale renders.
 *
 * Any project stuck in "processing" longer than 3× the model's estimated
 * render time is considered dead — the fal.ai request likely failed silently,
 * the API key was rotated, or the job was lost. We mark it failed and refund
 * the user's credits so they can retry immediately.
 *
 * Call once on startup and then every INTERVAL_MS to self-heal without a restart.
 */

import { db, projectsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { MODEL_RENDER_ESTIMATE, MODEL_CREDIT_COSTS } from "./falvideo";

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

      // Mark failed
      await db
        .update(projectsTable)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(projectsTable.id, project.id));

      // Refund credits — skip for admins (they don't spend credits)
      const creditCost =
        MODEL_CREDIT_COSTS[project.renderingModelId ?? "ovi"] ??
        MODEL_CREDIT_COSTS["ovi"];

      const [owner] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, project.userId));

      if (owner && !owner.isAdmin) {
        await db
          .update(usersTable)
          .set({ credits: owner.credits + creditCost })
          .where(eq(usersTable.id, owner.id));
        logger.info(
          { userId: owner.id, creditsRefunded: creditCost },
          "[render-timeout] Credits refunded"
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
