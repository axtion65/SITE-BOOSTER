import { Router } from "express";
import { db, usersTable, projectsTable } from "@workspace/db";
import { eq, gte, count, sql } from "drizzle-orm";
import { UpdateAdminUserBody } from "@workspace/api-zod";

const router = Router();

async function getAdminUser(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const userId = decoded.split(":")[0];
    if (!userId) return null;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user?.isAdmin) return null;
    return user;
  } catch {
    return null;
  }
}

router.get("/admin/stats", async (req, res) => {
  const admin = await getAdminUser(req.headers.authorization);
  if (!admin) { res.status(403).json({ error: "Forbidden" }); return; }

  const [{ totalUsers }] = await db.select({ totalUsers: count() }).from(usersTable);
  const [{ totalProjects }] = await db.select({ totalProjects: count() }).from(projectsTable);
  const [{ totalVideosCompleted }] = await db.select({ totalVideosCompleted: count() })
    .from(projectsTable).where(eq(projectsTable.status, "completed"));

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [{ recentSignups }] = await db.select({ recentSignups: count() })
    .from(usersTable).where(gte(usersTable.createdAt, sevenDaysAgo));

  const planCounts = await db.select({ plan: usersTable.plan, cnt: count() })
    .from(usersTable).groupBy(usersTable.plan);
  const usersByPlan = { free: 0, starter: 0, pro: 0, agency: 0 };
  for (const row of planCounts) {
    if (row.plan in usersByPlan) usersByPlan[row.plan as keyof typeof usersByPlan] = Number(row.cnt);
  }

  res.json({
    totalUsers: Number(totalUsers),
    totalProjects: Number(totalProjects),
    totalVideosCompleted: Number(totalVideosCompleted),
    usersByPlan,
    recentSignups: Number(recentSignups),
  });
});

router.get("/admin/users", async (req, res) => {
  const admin = await getAdminUser(req.headers.authorization);
  if (!admin) { res.status(403).json({ error: "Forbidden" }); return; }

  const users = await db.select().from(usersTable).orderBy(sql`${usersTable.createdAt} desc`);
  const projectCounts = await db.select({ userId: projectsTable.userId, cnt: count() })
    .from(projectsTable).groupBy(projectsTable.userId);
  const countMap = new Map(projectCounts.map((r) => [r.userId, Number(r.cnt)]));

  res.json(users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    plan: u.plan,
    credits: u.credits,
    isAdmin: u.isAdmin,
    projectCount: countMap.get(u.id) ?? 0,
    createdAt: u.createdAt.toISOString(),
  })));
});

router.patch("/admin/users/:id", async (req, res) => {
  const admin = await getAdminUser(req.headers.authorization);
  if (!admin) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = UpdateAdminUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.plan !== undefined) updates.plan = parsed.data.plan;
  if (parsed.data.credits !== undefined) updates.credits = parsed.data.credits;
  if (parsed.data.isAdmin !== undefined) updates.isAdmin = parsed.data.isAdmin;

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, req.params.id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [{ cnt }] = await db.select({ cnt: count() }).from(projectsTable).where(eq(projectsTable.userId, user.id));
  res.json({
    id: user.id, email: user.email, name: user.name, plan: user.plan,
    credits: user.credits, isAdmin: user.isAdmin,
    projectCount: Number(cnt), createdAt: user.createdAt.toISOString(),
  });
});

router.delete("/admin/users/:id", async (req, res) => {
  const admin = await getAdminUser(req.headers.authorization);
  if (!admin) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(projectsTable).where(eq(projectsTable.userId, req.params.id));
  await db.delete(usersTable).where(eq(usersTable.id, req.params.id));
  res.json({ success: true });
});

// POST /admin/broadcast — send an email to a subset of users
router.post("/admin/broadcast", async (req, res) => {
  const admin = await getAdminUser(req.headers.authorization);
  if (!admin) { res.status(403).json({ error: "Forbidden" }); return; }

  const { subject, message, audience } = req.body as {
    subject?: string; message?: string; audience?: string;
  };
  if (!subject?.trim() || !message?.trim()) {
    res.status(400).json({ error: "subject and message are required" });
    return;
  }

  const allUsers = await db.select().from(usersTable);
  const targets = allUsers.filter((u) => {
    if (audience === "paid") return u.plan !== "free";
    if (audience === "free") return u.plan === "free";
    return true; // "all"
  });

  const { sendBroadcastEmail } = await import("../lib/email");

  // Send with a small delay between each to respect rate limits
  let sent = 0;
  for (const user of targets) {
    await sendBroadcastEmail(user.email, user.name ?? "", subject, message);
    sent++;
    if (sent % 5 === 0) await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`[admin] Broadcast sent to ${sent} users — "${subject}"`);
  res.json({ sent, audience: audience ?? "all" });
});

export default router;
