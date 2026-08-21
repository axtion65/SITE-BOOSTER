import { Router } from "express";
import { db, projectsTable, usersTable, creditLedgerTable } from "@workspace/db";
import { eq, and, sql, inArray, isNull } from "drizzle-orm";
import { MODEL_CREDIT_COSTS, extractFalRequestId } from "../lib/falvideo";

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
      .set({ status: "failed", refundedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(projectsTable.id, projectId), isNull(projectsTable.refundedAt), inArray(projectsTable.status, ["processing", "narrating"])))
      .returning({ id: projectsTable.id });

    if (updated.length === 0) return;
    won = true;

    // Atomic credit refund — skip admins
    const balance = await tx
      .update(usersTable)
      .set({ credits: sql`${usersTable.credits} + ${creditCost}` })
      .where(and(eq(usersTable.id, userId), sql`${usersTable.isAdmin} = false`)).returning({ credits: usersTable.credits });
    if (balance[0]) await tx.insert(creditLedgerTable).values({ userId, projectId, kind: "refund", amount: creditCost, balanceAfter: balance[0].credits });
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

  // Find the project whose token contains this requestId.
  // Supports both token formats:
  //   v1 (legacy): "fal:<modelPath>:<requestId>"
  //   v2:          "fal2:<requestId>|||<statusUrl>|||<responseUrl>"
  const allProcessing = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.status, "processing"));

  const project = allProcessing.find(
    (p) => p.thumbnailUrl && extractFalRequestId(p.thumbnailUrl) === requestId
  );

  if (!project) {
    // Could be a re-render or a race — not an error, just acknowledge
    console.log(`[webhook/fal] No processing project found for request_id ${requestId}`);
    res.json({ ok: true });
    return;
  }

  if (payload.status === "FAILED" || payload.error) {
    console.error(`[webhook/fal] Render FAILED for project ${project.id}:`, payload.error);
    const creditCost = project.creditCharge;
    const wonFail = await failAndRefund(project.id, project.userId, creditCost);
    if (wonFail) {
      const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, project.userId));
      if (owner) {
        import("../lib/email").then(({ sendRenderFailedEmail }) =>
          sendRenderFailedEmail(owner.email, owner.name ?? "", project.title, project.id, creditCost).catch(() => {})
        );
      }
    }
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
    console.log(`[webhook/fal] Render COMPLETED for project ${project.id} — starting narration`);
    // Store the fal URL as a sentinel and clear the token so further polls skip fal.ai.
    // Status stays "processing" — the archival job below owns the final "completed"
    // transition after TTS narration and upload are done.
    // The stored fal URL acts as a race guard: both the timeout watcher (which now
    // skips rows in this state) and the archival conditional UPDATE check it.
    const won = await db
      .update(projectsTable)
      .set({ videoUrl: url, thumbnailUrl: null, updatedAt: new Date() })
      .where(and(eq(projectsTable.id, project.id), eq(projectsTable.status, "processing")))
      .returning({ id: projectsTable.id });

    if (won.length > 0) {
      const projectId = project.id;
      const falUrl = url;
      const creditCost = project.creditCharge;

      setImmediate(async () => {
        let permanentPath: string;
        try {
          const { ObjectStorageService } = await import("../lib/objectStorage");
          const storage = new ObjectStorageService();
          const storageIdentity = { userId: project.userId, projectId, renderId: requestId };

          // Transition to "narrating" so the client can show "Adding voiceover…" instead
          // of a broken silent video. Guard: status='processing' AND videoUrl=falUrl.
          const wonNarrating = await db.update(projectsTable)
            .set({ status: "narrating", updatedAt: new Date() })
            .where(and(
              eq(projectsTable.id, projectId),
              eq(projectsTable.status, "processing"),
              eq(projectsTable.videoUrl, falUrl),
            ))
            .returning({ id: projectsTable.id });

          if (wonNarrating.length === 0) {
            console.log(`[webhook/fal] Archival race: project ${projectId} was re-rendered — skipping narration`);
            return;
          }

          // Extract voiceoverText from expandedScript for narration
          let voiceoverText: string | undefined;
          try {
            if (project.expandedScript) {
              const scriptObj = JSON.parse(project.expandedScript) as { voiceoverText?: string };
              voiceoverText = scriptObj.voiceoverText?.trim() || undefined;
            }
          } catch { /* ignore — fall back to silent */ }

          if (voiceoverText) {
            try {
              const { generateSpeechBuffer } = await import("../lib/tts");
              const audioBuffer = await generateSpeechBuffer(voiceoverText, project.voiceId);
              if (audioBuffer) {
                const { addNarrationToVideo } = await import("../lib/videoNarrate");
                const narratedBuffer = await addNarrationToVideo(falUrl, audioBuffer);
                if (narratedBuffer) {
                  permanentPath = await storage.uploadVideoBuffer(narratedBuffer, storageIdentity);
                  console.log(`[webhook/fal] Narrated video archived for project ${projectId}`);
                } else {
                  console.warn("[webhook/fal] FFmpeg mix failed — archiving silent video");
                  permanentPath = await storage.uploadVideoFromUrl(falUrl, storageIdentity);
                }
              } else {
                console.warn("[webhook/fal] TTS returned null — archiving silent video");
                permanentPath = await storage.uploadVideoFromUrl(falUrl, storageIdentity);
              }
            } catch (err) {
              console.error("[webhook/fal] Narration error — archiving silent video:", err);
              permanentPath = await storage.uploadVideoFromUrl(falUrl, storageIdentity);
            }
          } else {
            permanentPath = await storage.uploadVideoFromUrl(falUrl, storageIdentity);
          }

          // Transition to completed — guarded by status='narrating' (we own this state
          // exclusively; a re-render resets to 'processing' and clears videoUrl).
          const completed = await db.update(projectsTable)
            .set({ status: "completed", videoUrl: permanentPath, updatedAt: new Date() })
            .where(and(
              eq(projectsTable.id, projectId),
              eq(projectsTable.status, "narrating"),
            ))
            .returning({ id: projectsTable.id });

          if (completed.length > 0) {
            console.log(`[webhook/fal] Video archived and marked completed for project ${projectId}`);
            const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, project.userId));
            if (owner) {
              import("../lib/email").then(({ sendRenderDoneEmail }) =>
                sendRenderDoneEmail(owner.email, owner.name ?? "", project.title, projectId).catch(() => {})
              );
            }
          } else {
            console.log(`[webhook/fal] Archival race: project ${projectId} was re-rendered — skipping completion`);
          }
        } catch (err) {
          console.error("[webhook/fal] Archival failed — failing project and refunding credits:", err);
          await failAndRefund(projectId, project.userId, creditCost).catch(() => {});
        }
      });
    }
  } else {
    console.error(`[webhook/fal] COMPLETED but no URL for project ${project.id}. Keys:`, Object.keys(output));
    // Fail + refund atomically
    const creditCost = project.creditCharge;
    const won = await failAndRefund(project.id, project.userId, creditCost);
    if (won) {
      const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, project.userId));
      if (owner) {
        import("../lib/email").then(({ sendRenderFailedEmail }) =>
          sendRenderFailedEmail(owner.email, owner.name ?? "", project.title, project.id, creditCost).catch(() => {})
        );
      }
    }
  }

  res.json({ ok: true });
});

export default router;
