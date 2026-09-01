import { Router } from "express";
import { db, pool, usersTable, projectsTable, creditLedgerTable } from "@workspace/db";
import { eq, and, sql, inArray, isNull } from "drizzle-orm";
import { CreateProjectBody, UpdateProjectBody } from "@workspace/api-zod";
import { PLAN_BY_SLUG, isPlanSlug } from "@workspace/plans";
import {
  pollFalVideoRender, isFalToken, isWebhookFalToken,
  MODEL_CREDIT_COSTS, type ExpandedScript
} from "../lib/falvideo";
import {
  approvedCampaignBriefToExpandedScript,
  approvedCampaignPlatform,
} from "../lib/videoRenderBrief";
import { logger } from "../lib/logger";
import { getProductionCreditCost, isNativeClipLength, RENDERING_MODEL_BY_ID, type RenderIntent } from "@workspace/plans";
import { ObjectPermission } from "../lib/objectAcl";
import { deriveApprovedTextVideoBrief } from "../lib/campaignAssets";
import { startVideoProduction } from "../lib/videoProduction";
import { VIDEO_PRODUCTION_VERSION } from "../lib/videoProductionPlan";

/** Log every field PostgreSQL/Drizzle exposes on a DB error. */
function logDbError(context: string, err: any): void {
  // Drizzle wraps the raw pg error in err.cause — unwrap it.
  const cause: any = err?.cause ?? err;
  logger.error({
    context,
    // Drizzle-level
    drizzle_message: err?.message,
    drizzle_stack: err?.stack,
    // PostgreSQL-level (may live on cause or err directly)
    message:    cause?.message,
    pg_code:    cause?.code,
    pg_detail:  cause?.detail,
    pg_hint:    cause?.hint,
    pg_table:   cause?.table,
    pg_column:  cause?.column,
    pg_constraint: cause?.constraint,
    pg_schema:  cause?.schema,
    pg_where:   cause?.where,
    pg_routine: cause?.routine,
    pg_stack:   cause?.stack,
  }, `DB error: ${context}`);
}

function matchesApprovedCampaignScript(value: unknown, approved: ExpandedScript): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<ExpandedScript>;
  return candidate.script === approved.script &&
    candidate.hook === approved.hook &&
    candidate.callToAction === approved.callToAction &&
    candidate.voiceoverText === approved.voiceoverText &&
    candidate.estimatedDuration === approved.estimatedDuration &&
    JSON.stringify(candidate.scenes) === JSON.stringify(approved.scenes);
}

const router = Router();
import { resolveUserIdFromToken } from "./auth";
const getUserIdFromToken = resolveUserIdFromToken;

/**
 * If a video URL points to our own object storage (/api/storage/objects/…),
 * generate a fresh short-lived signed URL so the client can always play it.
 * External URLs are returned only for backward-compatible completed projects.
 */
async function resolveVideoUrl(videoUrl: string | null | undefined, status?: string): Promise<string | null> {
  if (!videoUrl) return null;
  if (!videoUrl.startsWith("/api/storage/objects/")) return status === "completed" ? videoUrl : null;
  try {
    const { ObjectStorageService } = await import("../lib/objectStorage");
    const storage = new ObjectStorageService();
    const internalPath = "/objects/" + videoUrl.slice("/api/storage/objects/".length);
    return await storage.getSignedObjectEntityUrl(internalPath, 900);
  } catch (err) {
    console.error("[projects] Failed to sign video URL:", err);
    return null; // keep the durable reference private and let the client retry
  }
}

function isDurableVideoPath(value: string | null | undefined): value is string {
  return Boolean(value?.startsWith("/api/storage/objects/videos/"));
}

function downloadFilename(title: string): string {
  const safe = title.normalize("NFKD").replace(/[^a-zA-Z0-9 _-]/g, "").trim().replace(/\s+/g, "-").slice(0, 100);
  return `${safe || "quae-video"}.mp4`;
}

interface ArchiveJobContext {
  projectId: string;
  falUrl: string;        // sentinel: archival only wins if videoUrl still equals this
  userId: string;
  projectTitle: string;
  creditCost: number;
  isAdmin: boolean;
  renderId: string;
  voiceoverText?: string | null;
  voiceId?: string | null;
}

/**
 * Kick off async narration + archival of a fal.media video.
 *
 * Flow:
 *  1. Generate TTS audio from voiceoverText (OpenAI) and mix it over the video
 *     with FFmpeg.  Falls back silently to the plain video on any error.
 *  2. Upload the (narrated or original) video to permanent object storage.
 *  3. Transition the project to "completed" using a conditional UPDATE that
 *     checks videoUrl = falUrl — the sentinel ensures a concurrent rerender
 *     (which resets videoUrl to null) cannot be overwritten by a stale job.
 *  4. Send the "video ready" email only when this job wins the transition.
 *  5. If archival itself throws, fail+refund so the project is never stuck
 *     in "processing" indefinitely.
 *
 * Non-blocking — caller does not await this.
 */
function archiveVideoAsync(ctx: ArchiveJobContext) {
  const { projectId, falUrl, userId, projectTitle, creditCost, isAdmin, renderId, voiceoverText, voiceId } = ctx;
  setImmediate(async () => {
    let permanentPath: string;
    try {
      const { ObjectStorageService } = await import("../lib/objectStorage");
      const storage = new ObjectStorageService();
      const storageIdentity = { userId, projectId, renderId };

      // Transition to "narrating" so the client can show "Adding voiceover…" instead
      // of a broken silent video. Guard: status='processing' AND videoUrl=falUrl —
      // prevents overwriting a project whose re-render has already started.
      const wonNarrating = await db.update(projectsTable)
        .set({ status: "narrating", updatedAt: new Date() })
        .where(and(
          eq(projectsTable.id, projectId),
          eq(projectsTable.status, "processing"),
          eq(projectsTable.videoUrl, falUrl),
        ))
        .returning({ id: projectsTable.id });

      if (wonNarrating.length === 0) {
        console.log(`[projects] Archival race: project ${projectId} was re-rendered — skipping narration`);
        return;
      }

      if (voiceoverText) {
        try {
          const { generateSpeechBuffer } = await import("../lib/tts");
          const audioBuffer = await generateSpeechBuffer(voiceoverText, voiceId);

          if (audioBuffer) {
            const { addNarrationToVideo } = await import("../lib/videoNarrate");
            const narratedBuffer = await addNarrationToVideo(falUrl, audioBuffer);

            if (narratedBuffer) {
              permanentPath = await storage.uploadVideoBuffer(narratedBuffer, storageIdentity);
              console.log(`[projects] Narrated video archived for project ${projectId}`);
            } else {
              console.warn("[projects] FFmpeg mix failed — archiving silent video");
              permanentPath = await storage.uploadVideoFromUrl(falUrl, storageIdentity);
            }
          } else {
            console.warn("[projects] TTS returned null — archiving silent video");
            permanentPath = await storage.uploadVideoFromUrl(falUrl, storageIdentity);
          }
        } catch (err) {
          console.error("[projects] Narration pipeline error — archiving silent video:", err);
          permanentPath = await storage.uploadVideoFromUrl(falUrl, storageIdentity);
        }
      } else {
        permanentPath = await storage.uploadVideoFromUrl(falUrl, storageIdentity);
      }

      // Transition to completed — guarded by status='narrating' (we own this state
      // exclusively; a re-render would reset to 'processing' and clear videoUrl,
      // so we can rely on the status alone here).
      const completed = await db.update(projectsTable)
        .set({ status: "completed", videoUrl: permanentPath, updatedAt: new Date() })
        .where(and(
          eq(projectsTable.id, projectId),
          eq(projectsTable.status, "narrating"),
        ))
        .returning({ id: projectsTable.id });

      if (completed.length > 0) {
        console.log(`[projects] Video archived and marked completed for project ${projectId}`);
        // Notify user their video is ready
        const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
        if (owner) {
          import("../lib/email").then(({ sendRenderDoneEmail }) =>
            sendRenderDoneEmail(owner.email, owner.name ?? "", projectTitle, projectId).catch(() => {})
          );
        }
      } else {
        console.log(`[projects] Archival race: project ${projectId} was re-rendered — skipping completion`);
      }
    } catch (err) {
      console.error("[projects] Archival failed — failing project and refunding credits:", err);
      // Prevent project from being stuck in "narrating" forever
      await failAndRefund(projectId, userId, creditCost, isAdmin).catch(() => {});
    }
  });
}

function getFalToken(project: { thumbnailUrl: string | null }): string | null {
  return isFalToken(project.thumbnailUrl) ? project.thumbnailUrl! : null;
}

function getCreditCost(modelId: string, duration?: string | null): number {
  return RENDERING_MODEL_BY_ID[modelId]
    ? getProductionCreditCost(modelId, duration)
    : MODEL_CREDIT_COSTS[modelId] ?? MODEL_CREDIT_COSTS["ovi"];
}

class InsufficientCreditsError extends Error {}
class RenderAlreadyActiveError extends Error {}

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
      .set({ status: "failed", refundedAt: isAdmin ? null : new Date(), updatedAt: new Date() })
      .where(and(eq(projectsTable.id, projectId), isNull(projectsTable.refundedAt), inArray(projectsTable.status, ["preparing", "processing", "assembling", "narrating"])))
      .returning({ id: projectsTable.id, renderAttempt: projectsTable.renderAttempt });

    if (updated.length === 0) return; // Another path already resolved this project
    won = true;

    if (!isAdmin) {
      const [balance] = await tx
        .update(usersTable)
        .set({ credits: sql`${usersTable.credits} + ${creditCost}` })
        .where(eq(usersTable.id, userId)).returning({ credits: usersTable.credits });
      await tx.insert(creditLedgerTable).values({ userId, projectId, attempt: updated[0]!.renderAttempt, kind: "refund", amount: creditCost, balanceAfter: balance!.credits });
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
  const byStatus = { draft: 0, processing: 0, narrating: 0, completed: 0, failed: 0 };
  for (const p of projects) {
    if (p.status === "preparing" || p.status === "assembling") { byStatus.processing++; continue; }
    const s = p.status as keyof typeof byStatus;
    if (s in byStatus) byStatus[s]++;
  }

  const creditsUsed = projects.reduce((sum, project) => sum + (project.refundedAt ? 0 : project.creditCharge), 0);
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
      videoUrl: await resolveVideoUrl(p.videoUrl, p.status),
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
  const campaignId = typeof req.body?.campaignId === "string" ? req.body.campaignId : null;
  const campaignVideoBriefId = typeof req.body?.campaignVideoBriefId === "string" ? req.body.campaignVideoBriefId : null;
  const idempotencyKey = String(req.headers["idempotency-key"] || req.body?.idempotencyKey || "").trim();
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  if (!idempotencyKey || idempotencyKey.length > 200) {
    res.status(400).json({ error: "Idempotency-Key is required" }); return;
  }
  const [previous] = await db.select().from(projectsTable)
    .where(and(eq(projectsTable.userId, userId), eq(projectsTable.idempotencyKey, idempotencyKey)));
  if (previous) {
    res.json({ ...previous, videoUrl: await resolveVideoUrl(previous.videoUrl, previous.status), createdAt: previous.createdAt.toISOString(), updatedAt: previous.updatedAt.toISOString() });
    return;
  }

  let production: any = null;
  let authoritativeCampaignScript: ExpandedScript | null = null;
  let authoritativeCampaignPlatform: string | null = null;
  if (campaignId) {
    if (req.body?.confirmed !== true) {
      res.status(409).json({ error: "Review and explicitly confirm the campaign video before rendering." }); return;
    }
    if(parsed.data.renderIntent==="animate"){
      if(!campaignVideoBriefId){res.status(409).json({error:"Prepare and confirm the selected campaign visual before animating it."});return;}
      production = (await pool.query(`SELECT vb.*,c.name campaign_name,b.name business_name,mv.object_path
      FROM campaign_video_briefs vb
      JOIN campaigns c ON c.id=vb.campaign_id AND c.user_id=vb.customer_id AND c.business_id=vb.business_id
        AND c.approved_run_id=vb.campaign_run_id AND c.status='approved'
      JOIN businesses b ON b.id=vb.business_id AND b.user_id=vb.customer_id
      JOIN campaign_asset_selections s ON s.id=vb.selection_id AND s.active
        AND s.campaign_id=vb.campaign_id AND s.campaign_run_id=vb.campaign_run_id
        AND s.customer_id=vb.customer_id AND s.business_id=vb.business_id
        AND s.mockup_project_id=vb.mockup_project_id AND s.mockup_version_id=vb.mockup_version_id
      JOIN mockup_projects mp ON mp.id=vb.mockup_project_id AND mp.user_id=vb.customer_id AND mp.business_id=vb.business_id
      JOIN mockup_versions mv ON mv.id=vb.mockup_version_id AND mv.mockup_project_id=mp.id AND mv.status='completed'
      WHERE vb.id=$1 AND vb.campaign_id=$2 AND vb.customer_id=$3`, [campaignVideoBriefId, campaignId, userId])).rows[0];
      if (!production) { res.status(409).json({ error: "That prepared campaign video is stale, mismatched, or unavailable." }); return; }
      if (parsed.data.sourceAssetId !== production.object_path || parsed.data.productImageUrl !== `/api/storage${production.object_path}`) {
        res.status(409).json({ error: "The render source must be the exact confirmed visual version." }); return;
      }
    }else{
      if(campaignVideoBriefId||parsed.data.sourceAssetId||parsed.data.productImageUrl){res.status(409).json({error:"Create New must use only the approved campaign copy and no visual source."});return;}
      const authority=(await pool.query(`SELECT c.*,b.user_id business_owner_id,b.name business_name,b.website business_website,b.description business_description,b.target_customer business_target_customer,b.products_services business_products_services,b.primary_cta business_primary_cta,wi.id import_id,wi.approved_campaign_id import_approved_campaign_id,wi.user_id import_user_id,wi.business_id import_business_id,wi.source_url import_source_url,wi.content import_content,r.id campaign_run_id,r.status campaign_run_status,r.context_snapshot run_context,r.final_result run_final_result FROM campaigns c JOIN businesses b ON b.id=c.business_id AND b.user_id=c.user_id JOIN campaign_runs r ON r.id=c.approved_run_id AND r.campaign_id=c.id LEFT JOIN website_import_drafts wi ON wi.id=c.website_import_id WHERE c.id=$1 AND c.user_id=$2 AND c.status='approved'`,[campaignId,userId])).rows[0];
      const approvedBrief=authority?deriveApprovedTextVideoBrief(authority,{id:authority.campaign_run_id,status:authority.campaign_run_status,context_snapshot:authority.run_context,final_result:authority.run_final_result}):null;
      if(!authority||!approvedBrief){res.status(409).json({error:"The approved campaign copy is stale, unsafe, or unavailable. Return to the campaign before rendering."});return;}
      production={campaign_run_id:authority.campaign_run_id,brief:approvedBrief};
    }
    try {
      authoritativeCampaignScript = approvedCampaignBriefToExpandedScript(production.brief);
      authoritativeCampaignPlatform = approvedCampaignPlatform(production.brief?.platform);
    } catch {
      res.status(409).json({ error: "The approved campaign video brief is incomplete or unavailable." }); return;
    }
    let submittedCampaignScript: unknown = null;
    try { submittedCampaignScript = JSON.parse(parsed.data.expandedScript ?? ""); } catch { /* rejected below */ }
    if (!matchesApprovedCampaignScript(submittedCampaignScript, authoritativeCampaignScript)) {
      res.status(409).json({ error: "Campaign copy changed after approval. Return to the campaign and approve a revision before rendering." }); return;
    }
    if (parsed.data.platform && parsed.data.platform !== authoritativeCampaignPlatform) {
      res.status(409).json({ error: "The render platform must match the approved campaign brief." }); return;
    }
  }

  const renderIntent = parsed.data.renderIntent as RenderIntent;
  const model = RENDERING_MODEL_BY_ID[parsed.data.renderingModelId];
  if (!model?.supports.textToVideo) { res.status(400).json({ error: "Unsupported rendering model" }); return; }
  if (!isNativeClipLength(parsed.data.renderingModelId, parsed.data.duration)) {
    res.status(400).json({ error: "Full advert duration must be 15s, 30s, or 45s" }); return;
  }
  if (renderIntent === "create_new" && (parsed.data.sourceAssetId || parsed.data.productImageUrl)) {
    res.status(400).json({ error: "Create New cannot include a source asset" }); return;
  }
  if (renderIntent === "animate" && (!model.supports.imageToVideo || !parsed.data.sourceAssetId)) {
    res.status(400).json({ error: "Animate requires an image-capable model and explicit source asset" }); return;
  }

  let ownedSourcePath: string | null = null;
  if (renderIntent === "animate") {
    try {
      const { ObjectStorageService } = await import("../lib/objectStorage");
      const storage = new ObjectStorageService();
      ownedSourcePath = storage.normalizeObjectEntityPath(parsed.data.sourceAssetId!);
      if (!ownedSourcePath.startsWith("/objects/") ||
          parsed.data.productImageUrl !== `/api/storage${ownedSourcePath}`) {
        res.status(400).json({ error: "Source asset fields are contradictory" }); return;
      }
      const file = await storage.getObjectEntityFile(ownedSourcePath);
      if (!await storage.canAccessObjectEntity({ userId, objectFile: file, requestedPermission: ObjectPermission.READ })) {
        res.status(403).json({ error: "Source asset is not owned by this account" }); return;
      }
    } catch {
      res.status(403).json({ error: "Source asset is unavailable or not owned by this account" }); return;
    }
  }

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

  if (campaignId) {
    const campaign = await pool.query("SELECT 1 FROM campaigns WHERE id=$1 AND user_id=$2 AND status='approved'", [campaignId, userId]);
    if (!campaign.rows[0]) { res.status(404).json({ error: "Approved campaign not found" }); return; }
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  const creditCost = getCreditCost(parsed.data.renderingModelId ?? "ltx-fast", parsed.data.duration);

  let renderScript: ExpandedScript | null = authoritativeCampaignScript;
  if (!renderScript && parsed.data.expandedScript) {
    try { renderScript = JSON.parse(parsed.data.expandedScript) as ExpandedScript; }
    catch { /* malformed non-campaign input remains handled by the existing render boundary */ }
  }
  if (!renderScript?.voiceoverText?.trim() || !renderScript.scenes?.length) {
    res.status(400).json({ error: "A complete approved script and scene plan are required before production." });
    return;
  }
  const renderArtifact: string | null = renderScript
    ? JSON.stringify({ version: VIDEO_PRODUCTION_VERSION, targetDuration: parsed.data.duration ?? "30s", approvedScript: true })
    : parsed.data.script ?? null;

  let project: typeof projectsTable.$inferSelect;
  try {
    project = await db.transaction(async (tx) => {
      let balanceAfter = user.credits;
      if (!user.isAdmin) {
        const [balance] = await tx
          .update(usersTable)
          .set({ credits: sql`${usersTable.credits} - ${creditCost}` })
          .where(and(eq(usersTable.id, userId), sql`${usersTable.credits} >= ${creditCost}`))
          .returning({ credits: usersTable.credits });
        if (!balance) throw new InsufficientCreditsError();
        balanceAfter = balance.credits;
      }

      const [created] = await tx.insert(projectsTable).values({
        userId,
        campaignId,
        campaignRunId: production?.campaign_run_id ?? null,
        campaignVideoBriefId: production?.id ?? null,
        mockupProjectId: production?.mockup_project_id ?? null,
        mockupVersionId: production?.mockup_version_id ?? null,
        idempotencyKey,
        confirmedAt: new Date(),
        qualityStatus: "preparing",
        productionVersion: VIDEO_PRODUCTION_VERSION,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        renderingModelId: parsed.data.renderingModelId,
        script: renderArtifact,
        expandedScript: renderScript ? JSON.stringify(renderScript) : parsed.data.expandedScript ?? null,
        platform: authoritativeCampaignPlatform ?? parsed.data.platform ?? null,
        duration: parsed.data.duration ?? null,
        templateId: parsed.data.templateId ?? null,
        productImageUrl: parsed.data.productImageUrl ?? null,
        renderIntent,
        sourceAssetId: ownedSourcePath,
        creditCharge: user.isAdmin ? 0 : creditCost,
        voiceId: parsed.data.voiceId ?? null,
        status: "preparing",
      }).returning();

      if (!user.isAdmin) {
        await tx.insert(creditLedgerTable).values({
          userId,
          projectId: created!.id,
          attempt: created!.renderAttempt,
          kind: "charge",
          amount: -creditCost,
          balanceAfter,
        });
      }
      return created!;
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      res.status(402).json({ error: `Not enough credits. This render costs ${creditCost} credits.` });
      return;
    }
    const cause: any = (err as any)?.cause ?? err;
    if (cause?.code === "23505" && cause?.constraint === "projects_user_idempotency_unique") {
      const [replayed] = await db.select().from(projectsTable)
        .where(and(eq(projectsTable.userId, userId), eq(projectsTable.idempotencyKey, idempotencyKey)));
      if (replayed) {
        res.json({ ...replayed, videoUrl: await resolveVideoUrl(replayed.videoUrl, replayed.status), createdAt: replayed.createdAt.toISOString(), updatedAt: replayed.updatedAt.toISOString() });
        return;
      }
    }
    logDbError("CREATE project and debit credits", err);
    throw err;
  }

  // Full adverts are prepared asynchronously. The worker generates and measures
  // voiceover first, persists every scene, and only then submits visual jobs.
  startVideoProduction(project.id);

  res.status(201).json({ ...project, createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString() });
});

router.get("/projects/:id", async (req, res) => {
  const userId = await getUserIdFromToken(req.headers.authorization);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [project] = await db.select().from(projectsTable)
    .where(and(eq(projectsTable.id, req.params.id), eq(projectsTable.userId, userId)));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const token = getFalToken(project);
  // A timeout may mark a job failed before fal's completed response can be
  // retrieved. The timeout path intentionally preserves the original token,
  // so a later project read can recover that same provider result without
  // submitting or charging for another render.
  // New renders are completed by fal's signed webhook. Do not race that
  // authoritative payload with reconstructed result endpoints in a page GET.
  // The polling block remains only for legacy jobs submitted without webhooks.
  if (["processing", "failed"].includes(project.status) && token && !isWebhookFalToken(token)) {
    // fal.ai needs ~15s to register a newly submitted job in their queue.
    // Polling before that returns 405 and we incorrectly mark it failed.
    const secsSinceSubmit = (Date.now() - project.updatedAt.getTime()) / 1000;
    if (project.status === "processing" && secsSinceSubmit < 15) {
      res.json({ ...project, createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString() });
      return;
    }
    try {
      const poll = await pollFalVideoRender(token);
      if (poll.status === "done" && poll.url) {
        // Store the fal URL and clear the fal token so polling stops.
        // Status intentionally stays "processing" — the archival job below
        // owns the final "completed" transition after narration finishes.
        // The falUrl stored in videoUrl acts as a race-guard sentinel: the
        // archival conditional UPDATE only wins if videoUrl still matches,
        // preventing a concurrent rerender from being overwritten.
        const updated = await db.update(projectsTable)
          .set({ status: "processing", videoUrl: poll.url, thumbnailUrl: null, updatedAt: new Date() })
          .where(and(
            eq(projectsTable.id, project.id),
            inArray(projectsTable.status, ["processing", "failed"]),
            eq(projectsTable.thumbnailUrl, token),
          ))
          .returning();
        if (updated.length > 0) {
          // Extract voiceoverText for TTS narration
          let voiceoverText: string | undefined;
          try {
            if (project.script) {
              const artifact = JSON.parse(project.script) as { renderBrief?: { voiceoverText?: string } };
              voiceoverText = artifact.renderBrief?.voiceoverText?.trim() || undefined;
            }
            if (!voiceoverText && project.expandedScript) {
              const scriptObj = JSON.parse(project.expandedScript) as { voiceoverText?: string };
              voiceoverText = scriptObj.voiceoverText?.trim() || undefined;
            }
          } catch { /* ignore JSON parse errors — fall back to silent */ }
          const creditCost = getCreditCost(project.renderingModelId ?? "quae-v1");
          const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, project.userId));
          archiveVideoAsync({
            projectId: project.id,
            falUrl: poll.url,
            userId: project.userId,
            projectTitle: project.title,
            creditCost,
            isAdmin: owner?.isAdmin ?? false,
            renderId: (() => { try { return new URL(poll.url).searchParams.get("request_id") || project.id + "-" + project.updatedAt.getTime(); } catch { return project.id + "-" + project.updatedAt.getTime(); } })(),
            voiceoverText,
            voiceId: project.voiceId,
          });
          // Return current row — status is still "processing"; client keeps polling
          res.json({ ...updated[0], videoUrl: null, createdAt: updated[0].createdAt.toISOString(), updatedAt: updated[0].updatedAt.toISOString() });
        } else {
          // Already resolved (e.g. by timeout watcher) — return current state
          const [current] = await db.select().from(projectsTable).where(eq(projectsTable.id, project.id));
          const resolved = await resolveVideoUrl(current.videoUrl, current.status);
          res.json({ ...current, videoUrl: resolved, createdAt: current.createdAt.toISOString(), updatedAt: current.updatedAt.toISOString() });
        }
        return;
      }
      if (poll.status === "failed") {
        const creditCost = getCreditCost(project.renderingModelId ?? "quae-v1", project.duration);
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

  const resolvedVideoUrl = await resolveVideoUrl(project.videoUrl, project.status);
  res.json({ ...project, videoUrl: resolvedVideoUrl, createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString() });
});

/** Authenticated download; never redirects customers to a provider URL. */
router.get("/projects/:id/video/download", async (req, res) => {
  const userId = await getUserIdFromToken(req.headers.authorization);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [project] = await db.select().from(projectsTable)
    .where(and(eq(projectsTable.id, req.params.id), eq(projectsTable.userId, userId)));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }
  if (!isDurableVideoPath(project.videoUrl)) {
    res.status(409).json({ error: "This legacy video is not yet secured for download. Please try re-rendering it." });
    return;
  }

  try {
    const { ObjectStorageService } = await import("../lib/objectStorage");
    const storage = new ObjectStorageService();
    const objectFile = await storage.getObjectEntityFile(project.videoUrl);
    const allowed = await storage.canAccessObjectEntity({ userId, objectFile });
    if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }
    const response = await storage.downloadObject(objectFile, 0);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("Content-Disposition", `attachment; filename="${downloadFilename(project.title)}"`);
    if (response.body) {
      const { Readable } = await import("stream");
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else res.end();
  } catch (err) {
    console.error(`[projects] Durable download failed for project ${project.id}:`, err);
    res.status(503).json({ error: "Your video is temporarily unavailable. Please try again shortly." });
  }
});

router.post("/projects/:id/rerender", async (req, res) => {
  const userId = await getUserIdFromToken(req.headers.authorization);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [project] = await db.select().from(projectsTable)
    .where(and(eq(projectsTable.id, req.params.id), eq(projectsTable.userId, userId)));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }
  if (!project.expandedScript) { res.status(400).json({ error: "No script — generate one first." }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const creditCost = getCreditCost(project.renderingModelId ?? "quae-v1", project.duration);
  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  let reset: typeof projectsTable.$inferSelect;
  try {
    reset = await db.transaction(async (tx) => {
      const [locked] = await tx.select({ status: projectsTable.status })
        .from(projectsTable)
        .where(and(eq(projectsTable.id, project.id), eq(projectsTable.userId, userId)))
        .for("update");
      if (!locked) throw new Error("Project disappeared during re-render");
      if (["preparing", "processing", "assembling", "narrating"].includes(locked.status)) throw new RenderAlreadyActiveError();

      let balanceAfter = user.credits;
      if (!user.isAdmin) {
        const [balance] = await tx
          .update(usersTable)
          .set({ credits: sql`${usersTable.credits} - ${creditCost}` })
          .where(and(eq(usersTable.id, userId), sql`${usersTable.credits} >= ${creditCost}`))
          .returning({ credits: usersTable.credits });
        if (!balance) throw new InsufficientCreditsError();
        balanceAfter = balance.credits;
      }

      const [updated] = await tx.update(projectsTable)
        .set({
          status: "preparing",
          videoUrl: null,
          thumbnailUrl: null,
          script: JSON.stringify({ version: VIDEO_PRODUCTION_VERSION, targetDuration: project.duration ?? "30s", approvedScript: true }),
          productionVersion: VIDEO_PRODUCTION_VERSION,
          productionPlan: null,
          voiceoverPath: null,
          voiceoverDurationMs: null,
          targetDurationSeconds: null,
          qualityStatus: "preparing",
          creditCharge: user.isAdmin ? 0 : creditCost,
          refundedAt: null,
          renderAttempt: sql`${projectsTable.renderAttempt} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(projectsTable.id, project.id))
        .returning();

      if (!user.isAdmin) {
        await tx.insert(creditLedgerTable).values({
          userId,
          projectId: project.id,
          attempt: updated!.renderAttempt,
          kind: "charge",
          amount: -creditCost,
          balanceAfter,
        });
      }
      return updated!;
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      res.status(402).json({ error: `Not enough credits. Re-render costs ${creditCost} credits.` });
      return;
    }
    if (err instanceof RenderAlreadyActiveError) {
      res.status(409).json({ error: "This render is already in progress." });
      return;
    }
    throw err;
  }

  startVideoProduction(project.id);

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
  if (parsed.data.voiceId !== undefined) updates.voiceId = parsed.data.voiceId;

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
