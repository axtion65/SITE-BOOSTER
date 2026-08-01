import { Router } from "express";
import { db, usersTable, projectsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { CreateProjectBody, UpdateProjectBody } from "@workspace/api-zod";
import {
  submitFalVideoRender, pollFalVideoRender, isFalToken,
  MODEL_CREDIT_COSTS, type ExpandedScript
} from "../lib/falvideo";
import { TEMPLATES } from "./templates";

const router = Router();

async function getUserIdFromToken(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const decoded = Buffer.from(authHeader.slice(7), "base64url").toString("utf-8");
    return decoded.split(":")[0] || null;
  } catch { return null; }
}

function getFalToken(project: { thumbnailUrl: string | null }): string | null {
  return isFalToken(project.thumbnailUrl) ? project.thumbnailUrl! : null;
}

function getCreditCost(modelId: string): number {
  return MODEL_CREDIT_COSTS[modelId] ?? MODEL_CREDIT_COSTS["ovi"];
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

  res.json(projects.map(p => ({ ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() })));
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
    if (user.credits < creditCost) {
      res.status(402).json({ error: `Not enough credits. This render costs ${creditCost} credits. You have ${user.credits}.` });
      return;
    }
    // Deduct credits
    await db.update(usersTable).set({ credits: user.credits - creditCost }).where(eq(usersTable.id, userId));
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
      const token = await submitFalVideoRender(scriptObj, platform, duration, parsed.data.renderingModelId ?? "quae-v1", templateType, parsed.data.productImageUrl);
      await db.update(projectsTable).set({ thumbnailUrl: token, updatedAt: new Date() }).where(eq(projectsTable.id, project.id));
    } catch (err) {
      console.error("[fal-video] submit error — refunding credits", err);
      // Refund immediately so the user isn't charged for a render that never started (skip for admins)
      if (!user.isAdmin) await db.update(usersTable).set({ credits: user.credits }).where(eq(usersTable.id, userId));
      await db.update(projectsTable).set({ status: "failed", updatedAt: new Date() }).where(eq(projectsTable.id, project.id));
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
        const [updated] = await db.update(projectsTable)
          .set({ status: "completed", videoUrl: poll.url, thumbnailUrl: null, updatedAt: new Date() })
          .where(eq(projectsTable.id, project.id)).returning();
        // Notify user their video is ready
        const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, project.userId));
        if (owner) {
          import("../lib/email").then(({ sendRenderDoneEmail }) =>
            sendRenderDoneEmail(owner.email, owner.name ?? "", project.title, project.id).catch(() => {})
          );
        }
        res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
        return;
      }
      if (poll.status === "failed") {
        // Refund the credits so the user can retry for free
        const creditCost = getCreditCost(project.renderingModelId ?? "quae-v1");
        const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, project.userId));
        if (owner) {
          await db.update(usersTable)
            .set({ credits: owner.credits + creditCost })
            .where(eq(usersTable.id, project.userId));
          // Notify user of failure + refund
          import("../lib/email").then(({ sendRenderFailedEmail }) =>
            sendRenderFailedEmail(owner.email, owner.name ?? "", project.title, project.id, creditCost).catch(() => {})
          );
        }
        const [updated] = await db.update(projectsTable)
          .set({ status: "failed", thumbnailUrl: null, updatedAt: new Date() })
          .where(eq(projectsTable.id, project.id)).returning();
        res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
        return;
      }
    } catch (err) { console.error("[fal-video] poll error", err); }
  }

  res.json({ ...project, createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString() });
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
    if (user.credits < creditCost) {
      res.status(402).json({ error: `Not enough credits. Re-render costs ${creditCost} credits.` });
      return;
    }
    await db.update(usersTable).set({ credits: user.credits - creditCost }).where(eq(usersTable.id, userId));
  }

  const [reset] = await db.update(projectsTable)
    .set({ status: "processing", videoUrl: null, thumbnailUrl: null, updatedAt: new Date() })
    .where(eq(projectsTable.id, project.id)).returning();

  try {
    const scriptObj: ExpandedScript = JSON.parse(project.expandedScript);
    const templateType = TEMPLATES.find(t => t.id === project.templateId)?.templateType;
    const token = await submitFalVideoRender(scriptObj, project.platform ?? "youtube", project.duration ?? "30s", project.renderingModelId ?? "quae-v1", templateType, project.productImageUrl);
    await db.update(projectsTable).set({ thumbnailUrl: token, updatedAt: new Date() }).where(eq(projectsTable.id, project.id));
  } catch (err) {
    console.error("[fal-video] rerender submit error — refunding credits", err);
    // Refund immediately: render never started so credits should come back (skip for admins)
    if (!user.isAdmin) await db.update(usersTable).set({ credits: user.credits }).where(eq(usersTable.id, userId));
    await db.update(projectsTable).set({ status: "failed", updatedAt: new Date() }).where(eq(projectsTable.id, project.id));
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
