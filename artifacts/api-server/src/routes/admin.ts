import { randomUUID } from "crypto";
import { Router } from "express";
import { db, usersTable, projectsTable, emailQueueTable } from "@workspace/db";
import { eq, gte, count, sql, desc, like } from "drizzle-orm";
import { UpdateAdminUserBody } from "@workspace/api-zod";
import { resolveUserFromToken } from "./auth";
import { S3ObjectFile } from "../lib/objectStorage";
import { setObjectAclPolicy } from "../lib/objectAcl";
import { PLAN_CATALOG, PLAN_BY_SLUG, isPlanSlug, type PlanSlug } from "@workspace/plans";
import { logger } from "../lib/logger";

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
  const usersByPlan = Object.fromEntries(PLAN_CATALOG.map(plan => [plan.slug, 0])) as Record<PlanSlug, number>;
  for (const row of planCounts) {
    if (row.plan in usersByPlan) usersByPlan[row.plan as PlanSlug] = Number(row.cnt);
  }

  res.json({
    totalUsers: Number(totalUsers),
    totalProjects: Number(totalProjects),
    totalVideosCompleted: Number(totalVideosCompleted),
    usersByPlan,
    recentSignups: Number(recentSignups),
  });
});

function publicAdminUser(user: typeof usersTable.$inferSelect, projectCount = 0) {
  return {
    id: user.id, email: user.email, name: user.name, plan: user.plan, credits: user.credits,
    isAdmin: user.isAdmin, accountStatus: user.accountStatus,
    stripeCustomerId: user.stripeCustomerId, stripeSubscriptionId: user.stripeSubscriptionId,
    subscriptionStatus: user.subscriptionStatus, billingInterval: user.billingInterval,
    projectCount, createdAt: user.createdAt.toISOString(),
  };
}

router.get("/admin/users", async (req, res) => {
  const admin = await getAdminUser(req.headers.authorization);
  if (!admin) { res.status(403).json({ error: "Forbidden" }); return; }

  const users = await db.select().from(usersTable).orderBy(sql`${usersTable.createdAt} desc`);
  const projectCounts = await db.select({ userId: projectsTable.userId, cnt: count() })
    .from(projectsTable).groupBy(projectsTable.userId);
  const countMap = new Map(projectCounts.map((r) => [r.userId, Number(r.cnt)]));
  res.json(users.map((user) => publicAdminUser(user, countMap.get(user.id) ?? 0)));
});

router.patch("/admin/users/:id", async (req, res) => {
  const admin = await getAdminUser(req.headers.authorization);
  if (!admin) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = UpdateAdminUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }); return; }
  const input = parsed.data;
  const creditOperations = [input.credits, input.creditAdjustment, input.resetCredits].filter(value => value !== undefined && value !== false);
  if (creditOperations.length > 1 || (input.credits !== undefined && (!Number.isSafeInteger(input.credits) || input.credits < 0 || input.credits > 10_000_000)) ||
      (input.creditAdjustment !== undefined && (!Number.isSafeInteger(input.creditAdjustment) || Math.abs(input.creditAdjustment) > 10_000_000))) {
    res.status(400).json({ error: "Invalid credit operation" }); return;
  }
  if (input.plan !== undefined && !isPlanSlug(input.plan)) {
    res.status(400).json({ error: "Invalid plan" }); return;
  }
  if (req.params.id === admin.id && input.isAdmin === false && input.confirmSelfDemotion !== true) {
    res.status(400).json({ error: "Explicit confirmation is required to remove your own admin access" }); return;
  }

  const result = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(usersTable).where(eq(usersTable.id, req.params.id)).for("update");
    if (!before) return null;
    const updates: Partial<typeof usersTable.$inferInsert> = { updatedAt: new Date() };
    if (input.plan !== undefined) updates.plan = input.plan;
    if (input.isAdmin !== undefined) updates.isAdmin = input.isAdmin;
    if (input.accountStatus !== undefined) updates.accountStatus = input.accountStatus;

    const effectivePlan = (input.plan ?? before.plan);
    if (!isPlanSlug(effectivePlan)) throw new Error("User has an invalid current plan");
    if (input.credits !== undefined) updates.credits = input.credits;
    if (input.creditAdjustment !== undefined) {
      const balance = before.credits + input.creditAdjustment;
      if (balance < 0) throw new RangeError("Credit balance cannot be negative");
      updates.credits = balance;
    }
    if (input.resetCredits || input.resetCreditsForPlan) updates.credits = PLAN_BY_SLUG[effectivePlan].credits;

    const [after] = await tx.update(usersTable).set(updates).where(eq(usersTable.id, before.id)).returning();
    return { before, after };
  }).catch((error: unknown) => {
    if (error instanceof RangeError) return error;
    throw error;
  });
  if (!result) { res.status(404).json({ error: "User not found" }); return; }
  if (result instanceof RangeError) { res.status(400).json({ error: result.message }); return; }

  logger.info({
    action: "admin.user.update", adminId: admin.id, targetUserId: result.after.id,
    changes: input, before: { plan: result.before.plan, credits: result.before.credits, isAdmin: result.before.isAdmin, accountStatus: result.before.accountStatus },
    after: { plan: result.after.plan, credits: result.after.credits, isAdmin: result.after.isAdmin, accountStatus: result.after.accountStatus },
  }, "Admin changed user account");
  const [{ cnt }] = await db.select({ cnt: count() }).from(projectsTable).where(eq(projectsTable.userId, result.after.id));
  res.json(publicAdminUser(result.after, Number(cnt)));
});

// ─── Admin V2 operations dashboard ───────────────────────────────────────────
router.get("/admin/operations", async (req, res) => {
  const admin = await getAdminUser(req.headers.authorization);
  if (!admin) { res.status(403).json({ error: "Forbidden" }); return; }
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const [todayUsers, todayProjects, failedRenders, queued, activeUsers, recentProjects] = await Promise.all([
    db.select({ value: count() }).from(usersTable).where(gte(usersTable.createdAt, today)),
    db.select({ value: count() }).from(projectsTable).where(gte(projectsTable.createdAt, today)),
    db.select({ value: count() }).from(projectsTable).where(eq(projectsTable.status, "failed")),
    db.select({ value: count() }).from(projectsTable).where(eq(projectsTable.status, "processing")),
    db.select().from(usersTable).where(sql`${usersTable.subscriptionStatus} = 'active' OR (${usersTable.subscriptionStatus} IS NULL AND ${usersTable.plan} <> 'free')`),
    db.select().from(projectsTable).where(gte(projectsTable.createdAt, today)),
  ]);
  const { MODEL_CREDIT_COSTS } = await import("../lib/falvideo");
  const creditsUsedToday = recentProjects.reduce((sum, project) => sum + (MODEL_CREDIT_COSTS[project.renderingModelId] ?? 0), 0);
  const completed = recentProjects.filter(project => project.status === "completed");
  const averageRenderTimeSeconds = completed.length ? Math.round(completed.reduce((sum, project) => sum + Math.max(0, project.updatedAt.getTime() - project.createdAt.getTime()), 0) / completed.length / 1000) : 0;
  const mrrCents = activeUsers.reduce((sum, user) => sum + (isPlanSlug(user.plan) ? PLAN_BY_SLUG[user.plan].monthlyPriceCents : 0), 0);
  let databaseStatus = "operational";
  try { await db.execute(sql`select 1`); } catch { databaseStatus = "down"; }
  res.json({
    usersToday: Number(todayUsers[0]?.value ?? 0), videosToday: Number(todayProjects[0]?.value ?? 0), creditsUsedToday,
    activeSubscriptions: activeUsers.length, mrrCents, failedRenders: Number(failedRenders[0]?.value ?? 0),
    failedStripeWebhooks: null, queueLength: Number(queued[0]?.value ?? 0), averageRenderTimeSeconds,
    health: {
      openai: process.env.OPENAI_API_KEY ? "configured" : "not_configured",
      fal: process.env.FAL_KEY ? "configured" : "not_configured",
      stripe: process.env.STRIPE_API_KEY ? "configured" : "not_configured",
      storage: (process.env.PRIVATE_OBJECT_DIR || process.env.AWS_BUCKET_NAME) ? "configured" : "not_configured",
      database: databaseStatus,
    },
  });
});

router.get("/admin/render-debug", async (req, res) => {
  const admin = await getAdminUser(req.headers.authorization);
  if (!admin) { res.status(403).json({ error: "Forbidden" }); return; }
  const projects = await db.select().from(projectsTable).orderBy(desc(projectsTable.updatedAt)).limit(50);
  const safeUrl = (value: string | null) => {
    if (!value) return null;
    if (value.startsWith("data:")) return "[inline data omitted]";
    try { const url = new URL(value, "https://quae.invalid"); return value.startsWith("/") ? url.pathname : `${url.origin}${url.pathname}`; }
    catch { return "[invalid URL omitted]"; }
  };
  res.json(projects.map(project => ({
    id: project.id, userId: project.userId, title: project.title, status: project.status, model: project.renderingModelId,
    originalRequest: project.description, aiWriterOutput: project.expandedScript, validationOutput: project.script ? "Prompt generated" : "No generated prompt",
    rawPrompt: project.script, sanitizedPrompt: project.script?.trim() ?? null, finalVisualPrompt: project.expandedScript ?? project.script,
    voiceover: project.script, sceneTiming: project.duration, estimatedRuntime: project.duration,
    falPayload: { model: project.renderingModelId, prompt: project.expandedScript ?? project.script, image_url: safeUrl(project.productImageUrl), voice_id: project.voiceId },
    logs: { status: project.status, createdAt: project.createdAt, updatedAt: project.updatedAt, videoUrl: safeUrl(project.videoUrl) },
  })));
});

router.post("/admin/users/:id/impersonate", async (req, res) => {
  const admin = await getAdminUser(req.headers.authorization);
  if (!admin) { res.status(403).json({ error: "Forbidden" }); return; }
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, req.params.id));
  if (!target || target.accountStatus === "disabled") { res.status(400).json({ error: "User is missing or disabled" }); return; }
  const { generateImpersonationToken } = await import("./auth");
  logger.warn({ action: "admin.user.impersonate", adminId: admin.id, targetUserId: target.id }, "Admin impersonation started");
  res.json({ token: generateImpersonationToken(target.id), expiresInSeconds: 900, user: { id: target.id, email: target.email, name: target.name } });
});

router.post("/admin/users/:id/refresh-credits", async (req, res) => {
  const admin = await getAdminUser(req.headers.authorization);
  if (!admin) { res.status(403).json({ error: "Forbidden" }); return; }
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, req.params.id));
  if (!target || !isPlanSlug(target.plan)) { res.status(404).json({ error: "User or plan not found" }); return; }
  const [updated] = await db.update(usersTable).set({ credits: PLAN_BY_SLUG[target.plan].credits, updatedAt: new Date() }).where(eq(usersTable.id, target.id)).returning();
  logger.info({ action: "admin.user.refresh_credits", adminId: admin.id, targetUserId: target.id, credits: updated.credits }, "Admin refreshed credits");
  res.json(publicAdminUser(updated));
});

router.post("/admin/users/:id/sync-subscription", async (req, res) => {
  const admin = await getAdminUser(req.headers.authorization);
  if (!admin) { res.status(403).json({ error: "Forbidden" }); return; }
  const { stripeService } = await import("../stripeService");
  const updated = await stripeService.syncUserSubscription(req.params.id);
  logger.info({ action: "admin.user.sync_subscription", adminId: admin.id, targetUserId: req.params.id }, "Admin synchronized subscription");
  if (!updated) { res.status(404).json({ error: "No active Stripe subscription found" }); return; }
  res.json(publicAdminUser(updated));
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

      if (!bucketName || !objectName) throw new Error("Invalid PRIVATE_OBJECT_DIR");

      // Upload bytes directly to the configured S3-compatible bucket.
      const file = new S3ObjectFile(bucketName, objectName);
      await file.save(buffer, {
        contentType: mimeType as string,
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
