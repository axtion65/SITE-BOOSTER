import { Router } from "express";
import { db, usersTable, projectsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { CreateProjectBody, UpdateProjectBody } from "@workspace/api-zod";
import { submitShotstackRender, pollShotstackRender, type ExpandedScript } from "../lib/shotstack";

const router = Router();

async function getUserIdFromToken(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const userId = decoded.split(":")[0];
    return userId || null;
  } catch {
    return null;
  }
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
  const creditsUsed = Math.max(0, (user.plan === "free" ? 300 : user.plan === "creator" ? 3000 : 15000) - user.credits);
  res.json({ total: projects.length, byStatus, creditsUsed, creditsRemaining: user.credits });
});

router.get("/projects", async (req, res) => {
  const userId = await getUserIdFromToken(req.headers.authorization);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const projects = await db.select().from(projectsTable)
    .where(eq(projectsTable.userId, userId))
    .orderBy(sql`${projectsTable.createdAt} desc`);

  res.json(projects.map((p) => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  })));
});

router.post("/projects", async (req, res) => {
  const userId = await getUserIdFromToken(req.headers.authorization);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

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
    status: "processing",
  }).returning();

  // Fire Shotstack render in background if we have a script and the API key is configured
  if (process.env.SHOTSTACK_API_KEY && parsed.data.expandedScript) {
    const projectId = project.id;
    const platform = parsed.data.platform ?? "youtube";
    const duration = parsed.data.duration ?? "30s";
    const expandedScript = parsed.data.expandedScript;
    // Intentionally not awaited — render runs asynchronously
    (async () => {
      try {
        let scriptObj: ExpandedScript;
        try { scriptObj = JSON.parse(expandedScript); } catch { return; }
        const renderId = await submitShotstackRender(scriptObj, platform, duration);
        await db.update(projectsTable)
          .set({ shotstackRenderId: renderId, updatedAt: new Date() })
          .where(eq(projectsTable.id, projectId));
      } catch (err) {
        console.error("[shotstack] submit error", err);
      }
    })();
  }

  res.status(201).json({ ...project, createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString() });
});

router.get("/projects/:id", async (req, res) => {
  const userId = await getUserIdFromToken(req.headers.authorization);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [project] = await db.select().from(projectsTable)
    .where(and(eq(projectsTable.id, req.params.id), eq(projectsTable.userId, userId)));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  // Poll Shotstack for real render status
  if (project.status === "processing" && project.shotstackRenderId) {
    try {
      const poll = await pollShotstackRender(project.shotstackRenderId);
      if (poll.status === "done" && poll.url) {
        const [updated] = await db.update(projectsTable)
          .set({ status: "completed", videoUrl: poll.url, updatedAt: new Date() })
          .where(eq(projectsTable.id, project.id))
          .returning();
        res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
        return;
      }
      if (poll.status === "failed") {
        const [updated] = await db.update(projectsTable)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(projectsTable.id, project.id))
          .returning();
        res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
        return;
      }
    } catch (err) {
      console.error("[shotstack] poll error", err);
    }
  }

  // Fallback for projects without Shotstack (no API key, or no expandedScript):
  // keep "processing" indefinitely rather than assigning a random flower video
  res.json({ ...project, createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString() });
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
