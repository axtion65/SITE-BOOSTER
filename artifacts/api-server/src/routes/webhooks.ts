import { Router } from "express";
import { db, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

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
    await db
      .update(projectsTable)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(projectsTable.id, project.id));
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
    await db
      .update(projectsTable)
      .set({ videoUrl: url, status: "completed", updatedAt: new Date() })
      .where(eq(projectsTable.id, project.id));
  } else {
    console.error(`[webhook/fal] COMPLETED but no URL for project ${project.id}. Keys:`, Object.keys(output));
    await db
      .update(projectsTable)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(projectsTable.id, project.id));
  }

  res.json({ ok: true });
});

export default router;
