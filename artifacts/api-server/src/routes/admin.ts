import { randomUUID } from "crypto";
import { Router } from "express";
import { db, usersTable, projectsTable, emailQueueTable } from "@workspace/db";
import { eq, gte, count, sql, desc, like } from "drizzle-orm";
import { UpdateAdminUserBody } from "@workspace/api-zod";
import { resolveUserFromToken } from "./auth";
import { objectStorageClient } from "../lib/objectStorage";
import { setObjectAclPolicy } from "../lib/objectAcl";

const router = Router();

async function getAdminUser(authHeader: string | undefined) {
  const user = await resolveUserFromToken(authHeader);
  if (!user?.isAdmin) return null;
  return user;
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

// ─── Email queue monitoring ───────────────────────────────────────────────────

// GET /admin/email-queue — list queued / failed emails
router.get("/admin/email-queue", async (req, res) => {
  const admin = await getAdminUser(req.headers.authorization);
  if (!admin) { res.status(403).json({ error: "Forbidden" }); return; }

  const rows = await db.select().from(emailQueueTable)
    .orderBy(desc(emailQueueTable.createdAt))
    .limit(200);
  res.json(rows);
});

// POST /admin/email-queue/retry-all — retry every pending email
router.post("/admin/email-queue/retry-all", async (req, res) => {
  const admin = await getAdminUser(req.headers.authorization);
  if (!admin) { res.status(403).json({ error: "Forbidden" }); return; }

  const { retryAllPending } = await import("../lib/email");
  const result = await retryAllPending();
  console.log(`[admin] Email retry-all: ${result.sent}/${result.attempted} sent`);
  res.json(result);
});

// POST /admin/email-queue/:id/retry — retry a single queued email
router.post("/admin/email-queue/:id/retry", async (req, res) => {
  const admin = await getAdminUser(req.headers.authorization);
  if (!admin) { res.status(403).json({ error: "Forbidden" }); return; }

  const { retryQueuedEmail } = await import("../lib/email");
  const result = await retryQueuedEmail(req.params.id);
  res.json(result);
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

// ─── One-time migration: base64 product images → GCS object storage ──────────

// POST /admin/migrate/base64-images
// Iterates over every project whose productImageUrl starts with "data:" and
// re-uploads the raw bytes to GCS, replacing the column value with a short
// /objects/... path.  Safe to run multiple times — already-migrated rows are
// skipped automatically because they no longer start with "data:".
router.post("/admin/migrate/base64-images", async (req, res) => {
  const admin = await getAdminUser(req.headers.authorization);
  if (!admin) { res.status(403).json({ error: "Forbidden" }); return; }

  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    res.status(500).json({ error: "PRIVATE_OBJECT_DIR env var is not set" });
    return;
  }

  // Find all projects that still have a raw base64 data URL
  const rows = await db
    .select({ id: projectsTable.id, userId: projectsTable.userId, productImageUrl: projectsTable.productImageUrl })
    .from(projectsTable)
    .where(like(projectsTable.productImageUrl, "data:%"));

  console.log(`[migrate-base64] Found ${rows.length} project(s) with base64 productImageUrl`);

  const results: Array<{ id: string; status: "migrated" | "failed"; error?: string }> = [];

  for (const row of rows) {
    const { id, userId, productImageUrl } = row;
    if (!productImageUrl) continue;

    try {
      // Parse  data:<mimeType>;base64,<data>
      const match = productImageUrl.match(/^data:([^;]+);base64,(.+)$/s);
      if (!match) throw new Error("Unrecognised data URL format");
      const [, mimeType, base64Data] = match;
      const buffer = Buffer.from(base64Data as string, "base64");

      // Build GCS path mirroring what getObjectEntityUploadURL produces:
      // fullPath looks like  /bucketName/path/to/object
      const objectId = randomUUID();
      const dir = privateObjectDir.endsWith("/") ? privateObjectDir : `${privateObjectDir}/`;
      const fullPath = `${dir}uploads/${objectId}`;
      const pathWithSlash = fullPath.startsWith("/") ? fullPath : `/${fullPath}`;
      const parts = pathWithSlash.split("/");
      const bucketName = parts[1];
      const objectName = parts.slice(2).join("/");

      // Upload bytes directly to GCS
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      await file.save(buffer, {
        metadata: { contentType: mimeType as string },
        resumable: false,
      });

      // Set private ACL with the project owner — mirrors what the finalize
      // upload flow does in POST /storage/uploads/finalize
      await setObjectAclPolicy(file, { owner: userId, visibility: "private" });

      // Canonical short path — mirrors what normalizeObjectEntityPath() and the
      // POST /storage/uploads/finalize route write to the DB.
      //
      // Render path (/api/routes/projects.ts → falvideo.ts#uploadImageToFal) explicitly
      // handles this form: it intercepts strings starting with "/objects/" and streams
      // the GCS bytes server-side to fal.ai CDN before submitting the job, so fal.ai
      // never receives the private path directly.  ACL is enforced only for user-facing
      // GET /storage/objects/* requests; server-side GCS access bypasses it, so
      // re-renders and retries will continue to work after migration.
      const newPath = `/objects/uploads/${objectId}`;

      await db
        .update(projectsTable)
        .set({ productImageUrl: newPath, updatedAt: new Date() })
        .where(eq(projectsTable.id, id));

      console.log(`[migrate-base64] Migrated project ${id} → ${newPath} (owner: ${userId})`);
      results.push({ id, status: "migrated" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[migrate-base64] Failed to migrate project ${id}:`, message);
      results.push({ id, status: "failed", error: message });
    }
  }

  const migrated = results.filter((r) => r.status === "migrated").length;
  const failed   = results.filter((r) => r.status === "failed").length;
  console.log(`[migrate-base64] Done — ${migrated} migrated, ${failed} failed`);
  res.json({ total: rows.length, migrated, failed, results });
});

// ─── Backfill: set ACL on migrated product images that are missing it ─────────

// POST /admin/backfill/image-acls
// Scans every project whose productImageUrl is already an /objects/… path and
// ensures the underlying GCS object has the correct private ACL metadata.
// Objects uploaded via the normal upload flow already have ACL set; this only
// touches objects that were migrated by an older version of migrate-base64 that
// did not call setObjectAclPolicy.  Safe to re-run — objects that already have
// an ACL policy are skipped.
router.post("/admin/backfill/image-acls", async (req, res) => {
  const admin = await getAdminUser(req.headers.authorization);
  if (!admin) { res.status(403).json({ error: "Forbidden" }); return; }

  // Fetch all projects that have an /objects/ path (already migrated)
  const rows = await db
    .select({ id: projectsTable.id, userId: projectsTable.userId, productImageUrl: projectsTable.productImageUrl })
    .from(projectsTable)
    .where(like(projectsTable.productImageUrl, "/objects/%"));

  console.log(`[backfill-image-acls] Found ${rows.length} project(s) with /objects/ productImageUrl`);

  const results: Array<{ id: string; status: "skipped" | "fixed" | "failed"; reason?: string }> = [];

  for (const row of rows) {
    const { id, userId, productImageUrl } = row;
    if (!productImageUrl) continue;

    try {
      // Resolve the GCS File handle for this /objects/… path
      const { ObjectStorageService } = await import("../lib/objectStorage");
      const svc = new ObjectStorageService();
      const file = await svc.getObjectEntityFile(productImageUrl);

      // Check whether the ACL metadata is already set
      const { getObjectAclPolicy } = await import("../lib/objectAcl");
      const existing = await getObjectAclPolicy(file);
      if (existing) {
        results.push({ id, status: "skipped", reason: "ACL already set" });
        continue;
      }

      // Set the correct private ACL so the owner can access their image
      await setObjectAclPolicy(file, { owner: userId, visibility: "private" });
      console.log(`[backfill-image-acls] Fixed ACL for project ${id} (owner: ${userId})`);
      results.push({ id, status: "fixed" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[backfill-image-acls] Failed for project ${id}:`, message);
      results.push({ id, status: "failed", reason: message });
    }
  }

  const fixed   = results.filter((r) => r.status === "fixed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed  = results.filter((r) => r.status === "failed").length;
  console.log(`[backfill-image-acls] Done — ${fixed} fixed, ${skipped} skipped, ${failed} failed`);
  res.json({ total: rows.length, fixed, skipped, failed, results });
});

export default router;
