import { Router } from "express";
import { db, projectsTable, usersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { MODEL_CREDIT_COSTS } from "../lib/falvideo";

const router = Router();

function getCreditCost(modelId: string): number {
  return MODEL_CREDIT_COSTS[modelId] ?? MODEL_CREDIT_COSTS["ovi"];
}

/**
 * Atomically transition a project from "processing" → "failed" and refund credits
 * in a single transaction. Only performs the refund when the status transition wins,
 * preventing duplicate refunds from concurrent timeout/poll/webhook paths.
 */
async function failAndRefund(projectId: string, userId: string, creditCost: number): Promise<boolean> {
  let won = false;
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(projectsTable)
      .set({ status: "failed", updatedAt: new Date() })
      .where(and(eq(projectsTable.id, projectId), eq(projectsTable.status, "processing")))
      .returning({ id: projectsTable.id });

    if (updated.length === 0) return;
    won = true;

    // Atomic credit refund — skip admins
    await tx
      .update(usersTable)
      .set({ credits: sql`${usersTable.credits} + ${creditCost}` })
      .where(and(eq(usersTable.id, userId), sql`${usersTable.isAdmin} = false`));
  });
  return won;
}

// fal.ai webhook — called by fal.ai when a render completes or fails.
// Payload: { request_id, status, output: { video: { url } } }
// We look up the project by matching the stored fal token (thumbnailUrl = "fal:<model>:<requestId>")
router.post("/webhooks/fal", async (req, res) => {
  const payload = req.body as {
    request_id?: string;
    status?: string;
    output?: Record<string, unknown>;
    error?: string;
  };

  const requestId = payload?.request_id;
  if (!requestId) {
    res.status(400).json({ error: "Missing request_id" });
    return;
  }

  console.log(`[webhook/fal] ${requestId} status=${payload.status}`);

  // Find the project whose token ends with this requestId
  const allProcessing = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.status, "processing"));

  const project = allProcessing.find(
    (p) => p.thumbnailUrl && p.thumbnailUrl.endsWith(`:${requestId}`)
  );

  if (!project) {
    // Could be a re-render or a race — not an error, just acknowledge
    console.log(`[webhook/fal] No processing project found for request_id ${requestId}`);
    res.json({ ok: true });
    return;
  }

  if (payload.status === "FAILED" || payload.error) {
    console.error(`[webhook/fal] Render FAILED for project ${project.id}:`, payload.error);
    const creditCost = getCreditCost(project.renderingModelId ?? "ovi");
    await failAndRefund(project.id, project.userId, creditCost);
    res.json({ ok: true });
    return;
  }

  if (payload.status !== "COMPLETED") {
    // IN_QUEUE or IN_PROGRESS — nothing to do yet
    res.json({ ok: true });
    return;
  }

  // Extract video URL from output (handles various fal.ai output shapes)
  const output = payload.output ?? {};
  const url =
    (output as any)?.video?.url ??
    (output as any)?.video_url ??
    (output as any)?.url ??
    (output as any)?.videos?.[0]?.url ??
    (output as any)?.video ??
    null;

  if (url && typeof url === "string") {
    console.log(`[webhook/fal] Render COMPLETED for project ${project.id}`);
    // Conditional: only win if still "processing"
    await db
      .update(projectsTable)
      .set({ videoUrl: url, status: "completed", updatedAt: new Date() })
      .where(and(eq(projectsTable.id, project.id), eq(projectsTable.status, "processing")));
  } else {
    console.error(`[webhook/fal] COMPLETED but no URL for project ${project.id}. Keys:`, Object.keys(output));
    // Fail + refund atomically
    const creditCost = getCreditCost(project.renderingModelId ?? "ovi");
    await failAndRefund(project.id, project.userId, creditCost);
  }

  res.json({ ok: true });
});

export default router;
