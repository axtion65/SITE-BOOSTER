import {
  creditLedgerTable,
  db,
  pool,
  projectsTable,
  usersTable,
  videoRenderScenesTable,
} from "@workspace/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { buildFalWebhookUrl, pollFalVideoRender, submitFalSceneRender, type ExpandedScript } from "./falvideo";
import { generateSpeechBuffer } from "./tts";
import { probeMediaBuffer } from "./mediaProbe";
import {
  compileVideoProductionPlan,
  productionQualityGate,
  type ProductionBrand,
  type VideoProductionPlan,
  VIDEO_PRODUCTION_VERSION,
} from "./videoProductionPlan";

const ACTIVE_PROJECT_STATUSES = ["preparing", "processing", "assembling"];
const SCENE_FIRST_POLL_MS = 5 * 60_000;
const SCENE_SECOND_POLL_MS = 15 * 60_000;
const MAX_SCENE_POLLS = 2;
const SCENE_TRANSITION_TIMEOUT_MS = 20 * 60_000;

function failureText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000);
}

async function failProductionProject(projectId: string, failureCode: string, error: unknown): Promise<void> {
  await db.transaction(async (tx) => {
    const [failed] = await tx.update(projectsTable).set({
      status: "failed",
      qualityStatus: failureCode,
      refundedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(projectsTable.id, projectId),
      inArray(projectsTable.status, ACTIVE_PROJECT_STATUSES),
      isNull(projectsTable.refundedAt),
    )).returning();
    if (!failed) return;
    const [balance] = await tx.update(usersTable)
      .set({ credits: sql`${usersTable.credits} + ${failed.creditCharge}` })
      .where(and(eq(usersTable.id, failed.userId), sql`${usersTable.isAdmin} = false`))
      .returning({ credits: usersTable.credits });
    if (balance && failed.creditCharge > 0) {
      await tx.insert(creditLedgerTable).values({
        userId: failed.userId,
        projectId: failed.id,
        attempt: failed.renderAttempt,
        kind: "refund",
        amount: failed.creditCharge,
        balanceAfter: balance.credits,
      });
    }
  });
  console.error(`[video-production] ${projectId} failed (${failureCode}): ${failureText(error)}`);
}

async function productionContext(project: typeof projectsTable.$inferSelect): Promise<{
  brand: ProductionBrand;
  sourceAssetPaths: string[];
}> {
  const brandResult = await pool.query(`
    SELECT b.name,b.website,b.primary_cta,bk.default_cta,bk.logo_object_path,
      bk.primary_color,bk.secondary_color,bk.accent_color
    FROM businesses b
    LEFT JOIN brand_kits bk ON bk.business_id=b.id
    WHERE b.user_id=$1
    LIMIT 1
  `, [project.userId]);
  const row = brandResult.rows[0] ?? {};
  const brand: ProductionBrand = {
    name: String(row.name ?? project.title).trim(),
    website: row.website ?? null,
    logoObjectPath: row.logo_object_path ?? null,
    primaryColor: row.primary_color ?? null,
    secondaryColor: row.secondary_color ?? null,
    accentColor: row.accent_color ?? null,
    callToAction: String(row.default_cta ?? row.primary_cta ?? "Learn more").trim(),
  };
  const assetResult = await pool.query(`
    SELECT object_path FROM (
      SELECT pi.object_path,0 priority,pi.sort_order::numeric ordering
      FROM businesses b JOIN products p ON p.business_id=b.id AND p.active
      JOIN product_images pi ON pi.product_id=p.id WHERE b.user_id=$1
      UNION ALL
      SELECT mv.object_path,1 priority,mv.version_number::numeric ordering
      FROM mockup_projects mp JOIN mockup_versions mv ON mv.mockup_project_id=mp.id
      WHERE mp.user_id=$1 AND mv.status='completed' AND mv.object_path IS NOT NULL
    ) owned_assets ORDER BY priority,ordering LIMIT 8
  `, [project.userId]);
  const owned = assetResult.rows.map((asset) => String(asset.object_path)).filter(Boolean);
  const sourceAssetPaths = project.renderIntent === "animate"
    ? [project.sourceAssetId].filter((value): value is string => Boolean(value))
    : Array.from(new Set(owned));
  return { brand, sourceAssetPaths };
}

async function preparePlan(project: typeof projectsTable.$inferSelect): Promise<VideoProductionPlan> {
  if (project.productionPlan) return project.productionPlan as VideoProductionPlan;
  if (!project.expandedScript) throw new Error("Approved script is missing");
  const script = JSON.parse(project.expandedScript) as ExpandedScript;
  const voiceover = await generateSpeechBuffer(script.voiceoverText || script.script, project.voiceId);
  if (!voiceover) throw new Error("Voiceover generation failed before visual submission");
  const measured = await probeMediaBuffer(voiceover, "mp3");
  if (!measured.hasAudio) throw new Error("Generated voiceover has no audio stream");
  const context = await productionContext(project);
  context.brand.callToAction = script.callToAction?.trim() || context.brand.callToAction;
  const plan = compileVideoProductionPlan({
    script,
    duration: project.duration ?? "30s",
    platform: project.platform ?? "youtube",
    voiceoverDurationMs: measured.durationMs,
    brand: context.brand,
    sourceAssetPaths: context.sourceAssetPaths,
  });
  const { ObjectStorageService } = await import("./objectStorage");
  const storage = new ObjectStorageService();
  const renderId = `${project.renderAttempt}-${VIDEO_PRODUCTION_VERSION}`;
  const voiceoverPath = await storage.uploadVoiceoverBuffer(voiceover, {
    userId: project.userId,
    projectId: project.id,
    renderId,
  });
  await db.transaction(async (tx) => {
    const [won] = await tx.update(projectsTable).set({
      productionVersion: VIDEO_PRODUCTION_VERSION,
      productionPlan: plan,
      voiceoverPath,
      voiceoverDurationMs: measured.durationMs,
      targetDurationSeconds: plan.targetDurationSeconds,
      qualityStatus: "scenes_pending",
      updatedAt: new Date(),
    }).where(and(
      eq(projectsTable.id, project.id),
      eq(projectsTable.renderAttempt, project.renderAttempt),
      isNull(projectsTable.productionPlan),
    )).returning({ id: projectsTable.id });
    if (!won) return;
    await tx.insert(videoRenderScenesTable).values(plan.scenes.map((scene) => ({
      projectId: project.id,
      userId: project.userId,
      renderAttempt: project.renderAttempt,
      sceneIndex: scene.index,
      status: "pending",
      providerModelId: project.renderingModelId,
      prompt: scene.visualPrompt,
      narrationText: scene.narrationText,
      sourceAssetPath: scene.sourceAssetPath,
      expectedDurationMs: scene.durationMs,
    }))).onConflictDoNothing();
  });
  return plan;
}

async function submitScene(sceneId: string): Promise<void> {
  const [claimed] = await db.update(videoRenderScenesTable).set({ status: "submitting", updatedAt: new Date() })
    .where(and(eq(videoRenderScenesTable.id, sceneId), eq(videoRenderScenesTable.status, "pending")))
    .returning();
  if (!claimed) return;
  const [project] = await db.select().from(projectsTable).where(and(
    eq(projectsTable.id, claimed.projectId),
    eq(projectsTable.renderAttempt, claimed.renderAttempt),
    inArray(projectsTable.status, ["preparing", "processing"]),
  ));
  if (!project) return;
  try {
    const submission = await submitFalSceneRender({
      prompt: claimed.prompt,
      durationSeconds: claimed.expectedDurationMs / 1000,
      renderingModelId: claimed.providerModelId,
      platform: project.platform ?? "youtube",
      sourceAssetPath: claimed.sourceAssetPath,
      webhookUrl: buildFalWebhookUrl(),
    });
    await db.update(videoRenderScenesTable).set({
      status: "submitted",
      providerRequestId: submission.requestId,
      providerToken: submission.token,
      failureCode: null,
      failureMessage: null,
      updatedAt: new Date(),
    }).where(and(eq(videoRenderScenesTable.id, sceneId), eq(videoRenderScenesTable.status, "submitting")));
  } catch (error) {
    await db.update(videoRenderScenesTable).set({
      status: "failed",
      failureCode: "scene_submit_failed",
      failureMessage: failureText(error),
      updatedAt: new Date(),
    }).where(eq(videoRenderScenesTable.id, sceneId));
    await failProductionProject(claimed.projectId, "scene_submit_failed", error);
  }
}

export async function prepareVideoProduction(projectId: string): Promise<void> {
  const [project] = await db.select().from(projectsTable).where(and(
    eq(projectsTable.id, projectId),
    inArray(projectsTable.status, ["preparing", "processing"]),
    eq(projectsTable.productionVersion, VIDEO_PRODUCTION_VERSION),
  ));
  if (!project) return;
  try {
    await preparePlan(project);
    const scenes = await db.select().from(videoRenderScenesTable).where(and(
      eq(videoRenderScenesTable.projectId, project.id),
      eq(videoRenderScenesTable.renderAttempt, project.renderAttempt),
      eq(videoRenderScenesTable.status, "pending"),
    ));
    for (const scene of scenes) {
      await submitScene(scene.id);
      const [state] = await db.select({ status: projectsTable.status }).from(projectsTable).where(eq(projectsTable.id, project.id));
      if (state?.status === "failed") break;
    }
    const [active] = await db.select().from(projectsTable).where(eq(projectsTable.id, project.id));
    if (active?.status !== "failed") {
      await db.update(projectsTable).set({ status: "processing", qualityStatus: "scenes_rendering", updatedAt: new Date() })
        .where(and(eq(projectsTable.id, project.id), eq(projectsTable.renderAttempt, project.renderAttempt), eq(projectsTable.status, "preparing")));
    }
  } catch (error) {
    await failProductionProject(project.id, "production_preparation_failed", error);
  }
}

export function startVideoProduction(projectId: string): void {
  setImmediate(() => prepareVideoProduction(projectId).catch((error) =>
    failProductionProject(projectId, "production_worker_failed", error).catch(() => undefined)));
}

let productionWorkerTimer: NodeJS.Timeout | null = null;

/** Resume persisted plans after a deploy/restart; never submits a completed scene again. */
export function startVideoProductionWorker(): void {
  if (productionWorkerTimer) return;
  const tick = async () => {
    const active = await db.select({ id: projectsTable.id, status: projectsTable.status, renderAttempt: projectsTable.renderAttempt, updatedAt: projectsTable.updatedAt })
      .from(projectsTable)
      .where(and(eq(projectsTable.productionVersion, VIDEO_PRODUCTION_VERSION), inArray(projectsTable.status, ["preparing", "processing", "assembling"])));
    for (const project of active) {
      if (project.status === "preparing") {
        await prepareVideoProduction(project.id);
        continue;
      }
      if (project.status === "assembling") {
        // A normal assembly owns this state. Only reclaim it after a hard 20-minute
        // crash boundary; the conditional update prevents two workers from winning.
        if (Date.now() - project.updatedAt.getTime() < 20 * 60_000) continue;
        const [reclaimed] = await db.update(projectsTable).set({ status: "processing", qualityStatus: "assembly_resuming", updatedAt: new Date() })
          .where(and(eq(projectsTable.id, project.id), eq(projectsTable.renderAttempt, project.renderAttempt), eq(projectsTable.status, "assembling")))
          .returning({ id: projectsTable.id });
        if (!reclaimed) continue;
      }
      const scenes = await db.select().from(videoRenderScenesTable).where(and(
        eq(videoRenderScenesTable.projectId, project.id),
        eq(videoRenderScenesTable.renderAttempt, project.renderAttempt),
      ));
      for (const scene of scenes) {
        const ageMs = Date.now() - scene.updatedAt.getTime();
        if (scene.status === "pending") {
          await submitScene(scene.id);
        } else if (scene.status === "archiving" && ageMs >= SCENE_TRANSITION_TIMEOUT_MS) {
          // Archival writes use a deterministic object path, so a crashed archive
          // may safely be reclaimed without creating another provider job.
          await db.update(videoRenderScenesTable).set({ status: "submitted", updatedAt: new Date() })
            .where(and(eq(videoRenderScenesTable.id, scene.id), eq(videoRenderScenesTable.status, "archiving")));
        } else if (scene.status === "submitting" && ageMs >= SCENE_TRANSITION_TIMEOUT_MS) {
          // Submission may have crossed the network before the process died. Never
          // guess by submitting another paid job when no request id was persisted.
          await db.update(videoRenderScenesTable).set({ status: "failed", failureCode: "scene_submission_indeterminate", failureMessage: "Scene submission did not persist a provider request id", updatedAt: new Date() })
            .where(and(eq(videoRenderScenesTable.id, scene.id), eq(videoRenderScenesTable.status, "submitting")));
          await failProductionProject(project.id, "scene_submission_indeterminate", "Scene submission outcome is unknown; duplicate submission prevented");
        } else if (scene.status === "submitted" && scene.providerToken && scene.pollCount < MAX_SCENE_POLLS) {
          const pollDelay = scene.pollCount === 0 ? SCENE_FIRST_POLL_MS : SCENE_SECOND_POLL_MS;
          if (ageMs >= pollDelay) {
            // Signed callbacks are primary. Claim at most two fallback reads so
            // multiple workers cannot poll or resolve the same scene together.
            const [pollClaim] = await db.update(videoRenderScenesTable).set({ pollCount: scene.pollCount + 1, updatedAt: new Date() })
              .where(and(
                eq(videoRenderScenesTable.id, scene.id),
                eq(videoRenderScenesTable.status, "submitted"),
                eq(videoRenderScenesTable.pollCount, scene.pollCount),
              )).returning();
            if (pollClaim) {
              const poll = await pollFalVideoRender(scene.providerToken);
              if (poll.status === "done") {
                await processProductionSceneCompletion({ requestId: scene.providerRequestId!, status: "OK", videoUrl: poll.url });
              } else if (poll.status === "failed" || pollClaim.pollCount >= MAX_SCENE_POLLS) {
                await processProductionSceneCompletion({ requestId: scene.providerRequestId!, status: "ERROR", error: poll.status === "failed" ? "Provider scene failed" : "Provider scene did not complete after two status checks" });
              }
            }
          }
        }
        const [state] = await db.select({ status: projectsTable.status }).from(projectsTable).where(eq(projectsTable.id, project.id));
        if (state?.status === "failed") break;
      }
      const remaining = await db.select({ count: sql<number>`count(*)::int` }).from(videoRenderScenesTable).where(and(
        eq(videoRenderScenesTable.projectId, project.id),
        eq(videoRenderScenesTable.renderAttempt, project.renderAttempt),
        sql`${videoRenderScenesTable.status} <> 'completed'`,
      ));
      if (remaining[0]?.count === 0) await assembleVideoProduction(project.id, project.renderAttempt);
    }
  };
  void tick().catch((error) => console.error("[video-production] resume worker error", error));
  productionWorkerTimer = setInterval(() => void tick().catch((error) => console.error("[video-production] resume worker error", error)), 60_000);
  productionWorkerTimer.unref();
}

async function fetchMedia(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`Stored media download failed with HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function assembleVideoProduction(projectId: string, renderAttempt: number): Promise<void> {
  const [claimed] = await db.update(projectsTable).set({ status: "assembling", qualityStatus: "assembling", updatedAt: new Date() })
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.renderAttempt, renderAttempt), eq(projectsTable.status, "processing")))
    .returning();
  if (!claimed) return;
  try {
    const plan = claimed.productionPlan as VideoProductionPlan | null;
    if (!plan || !claimed.voiceoverPath) throw new Error("Persisted production plan or voiceover is missing");
    const scenes = await db.select().from(videoRenderScenesTable).where(and(
      eq(videoRenderScenesTable.projectId, projectId),
      eq(videoRenderScenesTable.renderAttempt, renderAttempt),
    ));
    const ordered = scenes.sort((a, b) => a.sceneIndex - b.sceneIndex);
    if (ordered.length !== plan.scenes.length || ordered.some((scene) => scene.status !== "completed" || !scene.outputPath)) {
      throw new Error("Cannot assemble until every scene is durably completed");
    }
    const { ObjectStorageService } = await import("./objectStorage");
    const storage = new ObjectStorageService();
    const voiceoverUrl = await storage.getSignedObjectEntityUrl(claimed.voiceoverPath, 3600);
    const sceneUrls = await Promise.all(ordered.map((scene) => storage.getSignedObjectEntityUrl(scene.outputPath!, 3600)));
    const { renderBusinessAdvert } = await import("./videoAssembler");
    const buffer = await renderBusinessAdvert({
      targetDurationSeconds: plan.targetDurationSeconds,
      width: plan.width,
      height: plan.height,
      voiceoverUrl,
      voiceoverDurationMs: plan.voiceoverDurationMs,
      scenes: ordered.map((scene, index) => ({
        videoUrl: sceneUrls[index]!,
        durationMs: plan.scenes[index]!.durationMs,
        caption: plan.scenes[index]!.narrationText,
      })),
      brand: plan.brand,
    });
    const media = await probeMediaBuffer(buffer, "mp4");
    const gate = productionQualityGate({ plan, finalDurationMs: media.durationMs, completedSceneCount: ordered.length, hasAudio: media.hasAudio });
    if (!gate.ok) throw new Error(gate.reason);
    const outputPath = await storage.uploadVideoBuffer(buffer, {
      userId: claimed.userId,
      projectId,
      renderId: `${renderAttempt}-${VIDEO_PRODUCTION_VERSION}`,
    });
    const [completed] = await db.update(projectsTable).set({
      status: "completed",
      qualityStatus: "passed",
      videoUrl: outputPath,
      thumbnailUrl: null,
      updatedAt: new Date(),
    }).where(and(eq(projectsTable.id, projectId), eq(projectsTable.renderAttempt, renderAttempt), eq(projectsTable.status, "assembling"))).returning();
    if (completed) {
      const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, completed.userId));
      if (owner) import("./email").then(({ sendRenderDoneEmail }) => sendRenderDoneEmail(owner.email, owner.name ?? "", completed.title, completed.id).catch(() => undefined));
    }
  } catch (error) {
    await failProductionProject(projectId, "assembly_quality_failed", error);
  }
}

export async function processProductionSceneCompletion(input: {
  requestId: string;
  status: "OK" | "ERROR";
  videoUrl?: string | null;
  error?: string | null;
}): Promise<boolean> {
  const [scene] = await db.select().from(videoRenderScenesTable).where(eq(videoRenderScenesTable.providerRequestId, input.requestId));
  if (!scene) return false;
  if (scene.status === "completed" || scene.status === "failed") return true;
  if (input.status === "ERROR" || !input.videoUrl) {
    if (scene.retryCount < 1) {
      const [retry] = await db.update(videoRenderScenesTable).set({
        status: "pending",
        retryCount: 1,
        providerRequestId: null,
        providerToken: null,
        pollCount: 0,
        failureCode: "provider_scene_failed",
        failureMessage: input.error ?? "Provider callback did not contain a scene video",
        updatedAt: new Date(),
      }).where(and(eq(videoRenderScenesTable.id, scene.id), eq(videoRenderScenesTable.status, "submitted"))).returning();
      if (retry) await submitScene(retry.id);
      return true;
    }
    const [failed] = await db.update(videoRenderScenesTable).set({ status: "failed", failureCode: "provider_scene_failed_twice", failureMessage: input.error ?? "Provider scene failed twice", updatedAt: new Date() })
      .where(and(eq(videoRenderScenesTable.id, scene.id), eq(videoRenderScenesTable.status, "submitted")))
      .returning({ id: videoRenderScenesTable.id });
    if (failed) await failProductionProject(scene.projectId, "provider_scene_failed_twice", input.error ?? "Provider scene failed twice");
    return true;
  }
  const [claimed] = await db.update(videoRenderScenesTable).set({ status: "archiving", updatedAt: new Date() })
    .where(and(eq(videoRenderScenesTable.id, scene.id), eq(videoRenderScenesTable.status, "submitted")))
    .returning();
  if (!claimed) return true;
  try {
    const { ObjectStorageService } = await import("./objectStorage");
    const storage = new ObjectStorageService();
    const outputPath = await storage.uploadSceneVideoFromUrl(input.videoUrl, {
      userId: claimed.userId,
      projectId: claimed.projectId,
      renderId: String(claimed.renderAttempt),
      sceneIndex: claimed.sceneIndex,
    });
    const signed = await storage.getSignedObjectEntityUrl(outputPath, 900);
    const media = await probeMediaBuffer(await fetchMedia(signed), "mp4");
    if (!media.hasVideo || media.durationMs + 250 < claimed.expectedDurationMs) throw new Error(`Scene output is too short: ${media.durationMs}ms`);
    await db.update(videoRenderScenesTable).set({ status: "completed", outputPath, actualDurationMs: media.durationMs, failureCode: null, failureMessage: null, updatedAt: new Date() })
      .where(and(eq(videoRenderScenesTable.id, claimed.id), eq(videoRenderScenesTable.status, "archiving")));
    const remaining = await db.select({ count: sql<number>`count(*)::int` }).from(videoRenderScenesTable).where(and(
      eq(videoRenderScenesTable.projectId, claimed.projectId),
      eq(videoRenderScenesTable.renderAttempt, claimed.renderAttempt),
      sql`${videoRenderScenesTable.status} <> 'completed'`,
    ));
    if (remaining[0]?.count === 0) setImmediate(() => assembleVideoProduction(claimed.projectId, claimed.renderAttempt).catch(() => undefined));
  } catch (error) {
    await db.update(videoRenderScenesTable).set({ status: "failed", failureCode: "scene_archive_failed", failureMessage: failureText(error), updatedAt: new Date() })
      .where(and(eq(videoRenderScenesTable.id, claimed.id), eq(videoRenderScenesTable.status, "archiving")));
    await failProductionProject(claimed.projectId, "scene_archive_failed", error);
  }
  return true;
}
