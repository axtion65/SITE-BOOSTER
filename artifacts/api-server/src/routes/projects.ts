import { Router } from "express";
import { db, usersTable, projectsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { CreateProjectBody, UpdateProjectBody } from "@workspace/api-zod";
import {
  submitFalVideoRender, pollFalVideoRender, isFalToken,
  MODEL_CREDIT_COSTS, buildFalWebhookUrl, type ExpandedScript
} from "../lib/falvideo";
import { TEMPLATES } from "./templates";

const router = Router();
import { resolveUserIdFromToken } from "./auth";
const getUserIdFromToken = resolveUserIdFromToken;

/**
 * If a video URL points to our own object storage (/api/storage/objects/…),
 * generate a fresh 24-hour signed URL so the client can always play it.
 * For external URLs (fal.media, shotstack, etc.) the value is returned as-is.
 */
async function resolveVideoUrl(videoUrl: string | null | undefined): Promise<string | null> {
  if (!videoUrl) return null;
  if (!videoUrl.startsWith("/api/storage/objects/")) return videoUrl;
  try {
    const { ObjectStorageService } = await import("../lib/objectStorage");
    const storage = new ObjectStorageService();
    const internalPath = "/objects/" + videoUrl.slice("/api/storage/objects/".length);
    return await storage.getSignedObjectEntityUrl(internalPath, 86400); // 24-hour signed URL
  } catch (err) {
    console.error("[projects] Failed to sign video URL:", err);
    return videoUrl; // fallback — client will see a broken link, but we don't lose the reference
  }
}

/**
 * Kick off async archival of a fal.media video URL to permanent object storage.
 * Updates the project row once archival completes.  Non-blocking — caller does
 * not wait for this to finish.
 */
function archiveVideoAsync(projectId: string, falUrl: string) {
  setImmediate(async () => {
    try {
      const { ObjectStorageService } = await import("../lib/objectStorage");
      const storage = new ObjectStorageService();
      const permanentPath = await storage.uploadVideoFromUrl(falUrl);
      await db.update(projectsTable)
        .set({ videoUrl: permanentPath, updatedAt: new Date() })
        .where(eq(projectsTable.id, projectId));
      console.log(`[projects] Video archived permanently for project ${projectId}`);
    } catch (err) {
      console.error("[projects] Archival failed — fal.media URL remains (will expire):", err);
    }
  });
}

function getFalToken(project: { thumbnailUrl: string | null }): string | null {
  return isFalToken(project.thumbnailUrl) ? project.thumbnailUrl! : null;
}

function getCreditCost(modelId: string): number {
  return MODEL_CREDIT_COSTS[modelId] ?? MODEL_CREDIT_COSTS["ovi"];
}

/**
 * Conditionally debit credits using a single UPDATE with a WHERE balance check.
 * Returns true when the debit succeeded, false when the user doesn't have enough credits.
 * Safe against concurrent requests: two simultaneous calls with exactly one render's
 * worth of credits will each see `credits >= cost` but only one UPDATE will win; the
 * other returns an empty array and gets a 402.
 */
async function debitCredits(userId: string, creditCost: number): Promise<boolean> {
  const rows = await db
    .update(usersTable)
    .set({ credits: sql`${usersTable.credits} - ${creditCost}` })
    .where(and(eq(usersTable.id, userId), sql`${usersTable.credits} >= ${creditCost}`))
    .returning({ id: usersTable.id });
  return rows.length > 0;
}

/**
 * Atomically transition a project from "processing" → "failed" and refund credits
 * in a single transaction. Only performs the refund when the status transition wins,
 * preventing duplicate refunds from concurrent timeout/poll/webhook paths.
 *
 * Returns true if this call won the transition (and issued the refund).
 */
async function failAndRefund(projectId: string, userId: string, creditCost: number, isAdmin: boolean): Promise<boolean> {
  let won = false;
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(projectsTable)
      .set({ status: "failed", updatedAt: new Date() })
      .where(and(eq(projectsTable.id, projectId), eq(projectsTable.status, "processing")))
      .returning({ id: projectsTable.id });

    if (updated.length === 0) return; // Another path already resolved this project
    won = true;

    if (!isAdmin) {
      await tx
        .update(usersTable)
        .set({ credits: sql`${usersTable.credits} + ${creditCost}` })
        .where(eq(usersTable.id, userId));
    }
  });
  return won;
}

router.get("/projects/stats", async (req, res) => {
  const userId = await getUserIdFromToken(req.headers.authorization);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  const projects = await db.select().from(projectsTable).where(eq(projectsTable.userId, userId));
  const byStatus = { draft: 0, processing: 0, completed: 0, failed: 0 };
  for (const p of projects) {
    const s = p.status as keyof typeof byStatus;
    if (s in byStatus) byStatus[s]++;
  }

  const maxCredits = { free: 90, starter: 600, pro: 2000, agency: 6000 }[user.plan ?? "free"] ?? 90;
  const creditsUsed = Math.max(0, maxCredits - user.credits);
  res.json({ total: projects.length, byStatus, creditsUsed, creditsRemaining: user.credits });
});

router.get("/projects", async (req, res) => {
  const userId = await getUserIdFromToken(req.headers.authorization);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const projects = await db.select().from(projectsTable)
    .where(eq(projectsTable.userId, userId))
    .orderBy(sql`${projectsTable.createdAt} desc`);

  const resolved = await Promise.all(
    projects.map(async (p) => ({
      ...p,
      videoUrl: await resolveVideoUrl(p.videoUrl),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }))
  );
  res.json(resolved);
});

router.post("/projects", async (req, res) => {
  const userId = await getUserIdFromToken(req.headers.authorization);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  // Reject base64 data URLs and oversized image strings — product images must be
  // uploaded via the presigned URL flow; only short GCS object paths or https URLs
  // are accepted. This is the server-side enforcement point for the anti-bloat policy.
  const imageUrl = parsed.data.productImageUrl;
  if (imageUrl) {
    if (imageUrl.startsWith("data:")) {
      res.status(400).json({
        error: "productImageUrl must be a storage object path or https URL, not a base64 data URL. Upload via POST /api/storage/uploads/request-url first.",
      });
      return;
    }
    if (imageUrl.length > 2048) {
      res.status(400).json({ error: "productImageUrl is too long. Expected a short object path or URL (max 2048 chars)." });
      return;
    }
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  const creditCost = getCreditCost(parsed.data.renderingModelId ?? "quae-v1");

  // Admins bypass credit checks so they can test all tiers freely
  if (!user.isAdmin) {
    const ok = await debitCredits(userId, creditCost);
    if (!ok) {
      res.status(402).json({ error: `Not enough credits. This render costs ${creditCost} credits.` });
      return;
    }
  }

  const [project] = await db.insert(projectsTable).values({
    userId,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    renderingModelId: parsed.data.renderingModelId,
    script: parsed.data.script ?? null,
    expandedScript: parsed.data.expandedScript ?? null,
    platform: parsed.data.platform ?? null,
    duration: parsed.data.duration ?? null,
    templateId: parsed.data.templateId ?? null,
    productImageUrl: parsed.data.productImageUrl ?? null,
    status: "processing",
  }).returning();

  // Submit fal.ai video render synchronously before responding
  if (process.env.FAL_KEY && parsed.data.expandedScript) {
    try {
      const scriptObj: ExpandedScript = JSON.parse(parsed.data.expandedScript);
      const platform = parsed.data.platform ?? "youtube";
      const duration = parsed.data.duration ?? "30s";
      const templateType = TEMPLATES.find(t => t.id === parsed.data.templateId)?.templateType;
      const webhookUrl = buildFalWebhookUrl();
      const token = await submitFalVideoRender(scriptObj, platform, duration, parsed.data.renderingModelId ?? "quae-v1", templateType, parsed.data.productImageUrl, webhookUrl || undefined);
      await db.update(projectsTable).set({ thumbnailUrl: token, updatedAt: new Date() }).where(eq(projectsTable.id, project.id));
    } catch (err) {
      console.error("[fal-video] submit error — refunding credits", err);
      // Render never started — fail+refund atomically. Project was just inserted so
      // status is guaranteed "processing"; no race window, but use failAndRefund for
      // consistency so refund is always transactional.
      await failAndRefund(project.id, userId, creditCost, user.isAdmin);
    }
  }

  res.status(201).json({ ...project, createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString() });
});

router.get("/projects/:id", async (req, res) => {
  const userId = await getUserIdFromToken(req.headers.authorization);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [project] = await db.select().from(projectsTable)
    .where(and(eq(projectsTable.id, req.params.id), eq(projectsTable.userId, userId)));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const token = getFalToken(project);
  if (project.status === "processing" && token) {
    try {
      const poll = await pollFalVideoRender(token);
      if (poll.status === "done" && poll.url) {
        // Conditional transition: only win if the row is still "processing".
        // The timeout watcher may have already failed it — do not overwrite.
        const updated = await db.update(projectsTable)
          .set({ status: "completed", videoUrl: poll.url, thumbnailUrl: null, updatedAt: new Date() })
          .where(and(eq(projectsTable.id, project.id), eq(projectsTable.status, "processing")))
          .returning();
        if (updated.length > 0) {
          // Archive the fal.media URL to permanent storage in the background
          archiveVideoAsync(project.id, poll.url);
          // Notify user their video is ready
          const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, project.userId));
          if (owner) {
            import("../lib/email").then(({ sendRenderDoneEmail }) =>
              sendRenderDoneEmail(owner.email, owner.name ?? "", project.title, project.id).catch(() => {})
            );
          }
          const resolved = await resolveVideoUrl(poll.url);
          res.json({ ...updated[0], videoUrl: resolved, createdAt: updated[0].createdAt.toISOString(), updatedAt: updated[0].updatedAt.toISOString() });
        } else {
          // Already resolved (e.g. by timeout watcher) — return current state
          const [current] = await db.select().from(projectsTable).where(eq(projectsTable.id, project.id));
          const resolved = await resolveVideoUrl(current.videoUrl);
          res.json({ ...current, videoUrl: resolved, createdAt: current.createdAt.toISOString(), updatedAt: current.updatedAt.toISOString() });
        }
        return;
      }
      if (poll.status === "failed") {
        const creditCost = getCreditCost(project.renderingModelId ?? "quae-v1");
        const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, project.userId));
        const isAdmin = owner?.isAdmin ?? false;
        // Atomic transition + refund in a single transaction
        const won = await failAndRefund(project.id, project.userId, creditCost, isAdmin);
        if (won && owner) {
          import("../lib/email").then(({ sendRenderFailedEmail }) =>
            sendRenderFailedEmail(owner.email, owner.name ?? "", project.title, project.id, creditCost).catch(() => {})
          );
        }
        const [current] = await db.select().from(projectsTable).where(eq(projectsTable.id, project.id));
        res.json({ ...current, createdAt: current.createdAt.toISOString(), updatedAt: current.updatedAt.toISOString() });
        return;
      }
    } catch (err) { console.error("[fal-video] poll error", err); }
  }

  const resolvedVideoUrl = await resolveVideoUrl(project.videoUrl);
  res.json({ ...project, videoUrl: resolvedVideoUrl, createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString() });
});

router.post("/projects/:id/rerender", async (req, res) => {
  const userId = await getUserIdFromToken(req.headers.authorization);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [project] = await db.select().from(projectsTable)
    .where(and(eq(projectsTable.id, req.params.id), eq(projectsTable.userId, userId)));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }
  if (!project.expandedScript) { res.status(400).json({ error: "No script — generate one first." }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const creditCost = getCreditCost(project.renderingModelId ?? "quae-v1");
  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  // Admins bypass credit checks
  if (!user.isAdmin) {
    const ok = await debitCredits(userId, creditCost);
    if (!ok) {
      res.status(402).json({ error: `Not enough credits. Re-render costs ${creditCost} credits.` });
      return;
    }
  }

  const [reset] = await db.update(projectsTable)
    .set({ status: "processing", videoUrl: null, thumbnailUrl: null, updatedAt: new Date() })
    .where(eq(projectsTable.id, project.id)).returning();

  try {
    const scriptObj: ExpandedScript = JSON.parse(project.expandedScript);
    const templateType = TEMPLATES.find(t => t.id === project.templateId)?.templateType;
    const webhookUrl = buildFalWebhookUrl();
    const token = await submitFalVideoRender(scriptObj, project.platform ?? "youtube", project.duration ?? "30s", project.renderingModelId ?? "quae-v1", templateType, project.productImageUrl, webhookUrl || undefined);
    await db.update(projectsTable).set({ thumbnailUrl: token, updatedAt: new Date() }).where(eq(projectsTable.id, project.id));
  } catch (err) {
    console.error("[fal-video] rerender submit error — refunding credits", err);
    // Render never started — fail+refund atomically
    await failAndRefund(project.id, userId, creditCost, user.isAdmin);
  }

  res.json({ ...reset, createdAt: reset.createdAt.toISOString(), updatedAt: reset.updatedAt.toISOString() });
});

router.patch("/projects/:id", async (req, res) => {
  const userId = await getUserIdFromToken(req.headers.authorization);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const [existing] = await db.select().from(projectsTable)
    .where(and(eq(projectsTable.id, req.params.id), eq(projectsTable.userId, userId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.renderingModelId !== undefined) updates.renderingModelId = parsed.data.renderingModelId;
  if (parsed.data.script !== undefined) updates.script = parsed.data.script;
  if (parsed.data.expandedScript !== undefined) updates.expandedScript = parsed.data.expandedScript;
  if (parsed.data.platform !== undefined) updates.platform = parsed.data.platform;
  if (parsed.data.duration !== undefined) updates.duration = parsed.data.duration;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;

  const [project] = await db.update(projectsTable).set(updates).where(eq(projectsTable.id, req.params.id)).returning();
  res.json({ ...project, createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString() });
});

router.delete("/projects/:id", async (req, res) => {
  const userId = await getUserIdFromToken(req.headers.authorization);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [existing] = await db.select().from(projectsTable)
    .where(and(eq(projectsTable.id, req.params.id), eq(projectsTable.userId, userId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  await db.delete(projectsTable).where(eq(projectsTable.id, req.params.id));
  res.json({ success: true });
});

export default router;
