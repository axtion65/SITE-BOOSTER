import { db, projectsTable, usersTable, creditLedgerTable } from "@workspace/db";
import { eq, and, sql, inArray, isNull } from "drizzle-orm";
import { MODEL_CREDIT_COSTS, extractFalRequestId } from "../lib/falvideo";

function getCreditCost(modelId: string): number {
  return MODEL_CREDIT_COSTS[modelId] ?? MODEL_CREDIT_COSTS["ovi"];
}

/**
 * Atomically transition a project from "processing" → "failed" and refund credits
 * in a single transaction. Only performs the refund when the status transition wins,
 * preventing duplicate refunds from concurrent timeout/poll/webhook paths.
 */
async function failAndRefund(
  projectId: string,
  userId: string,
  creditCost: number,
  expectedToken?: string,
): Promise<boolean> {
  let won = false;
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(projectsTable)
      .set({ status: "failed", refundedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(projectsTable.id, projectId),
        isNull(projectsTable.refundedAt),
        inArray(projectsTable.status, ["processing", "narrating"]),
        expectedToken ? eq(projectsTable.thumbnailUrl, expectedToken) : undefined,
      ))
      .returning({ id: projectsTable.id, renderAttempt: projectsTable.renderAttempt });

    if (updated.length === 0) return;
    won = true;

    // Atomic credit refund — skip admins
    const balance = await tx
      .update(usersTable)
      .set({ credits: sql`${usersTable.credits} + ${creditCost}` })
      .where(and(eq(usersTable.id, userId), sql`${usersTable.isAdmin} = false`)).returning({ credits: usersTable.credits });
    if (balance[0]) await tx.insert(creditLedgerTable).values({ userId, projectId, attempt: updated[0]!.renderAttempt, kind: "refund", amount: creditCost, balanceAfter: balance[0].credits });
  });
  return won;
}

export type FalCompletionEvent = {
  request_id: string;
  gateway_request_id?: string;
  status: "OK" | "ERROR";
  payload?: Record<string, unknown> | null;
  payload_error?: string;
  error?: string;
};

/**
 * Persist one terminal fal event. The raw HTTP boundary verifies fal's
 * signature before calling this function. request_id is the idempotency key:
 * the first conditional project update wins and duplicate deliveries become
 * harmless acknowledgements.
 */
export async function processFalCompletion(payload: FalCompletionEvent): Promise<void> {
  const requestId = payload.request_id;

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
    // Duplicate delivery or a render attempt that has already been replaced.
    console.log(`[webhook/fal] No processing project found for request_id ${requestId}`);
    return;
  }

  if (payload.status === "ERROR" || payload.error) {
    console.error(`[webhook/fal] Render FAILED for project ${project.id}:`, payload.error);
    const creditCost = project.creditCharge;
    const wonFail = await failAndRefund(project.id, project.userId, creditCost, project.thumbnailUrl!);
    if (wonFail) {
      const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, project.userId));
      if (owner) {
        import("../lib/email").then(({ sendRenderFailedEmail }) =>
          sendRenderFailedEmail(owner.email, owner.name ?? "", project.title, project.id, creditCost).catch(() => {})
        );
      }
    }
    return;
  }

  // fal webhooks use status=OK and put the complete model result in payload.
  const output = payload.payload ?? {};
  const url =
    (output as any)?.video?.url ??
    (output as any)?.video_url ??
    (output as any)?.url ??
    (output as any)?.videos?.[0]?.url ??
    (output as any)?.video ??
    null;

  if (url && typeof url === "string") {
    console.log(`[webhook/fal] Render OK for project ${project.id} — starting narration`);
    // Store the fal URL as a sentinel and clear the token so further polls skip fal.ai.
    // Status stays "processing" — the archival job below owns the final "completed"
    // transition after TTS narration and upload are done.
    // The stored fal URL acts as a race guard: both the timeout watcher (which now
    // skips rows in this state) and the archival conditional UPDATE check it.
    const won = await db
      .update(projectsTable)
      .set({ videoUrl: url, thumbnailUrl: null, updatedAt: new Date() })
      .where(and(
        eq(projectsTable.id, project.id),
        eq(projectsTable.status, "processing"),
        eq(projectsTable.thumbnailUrl, project.thumbnailUrl!),
      ))
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
    console.error(`[webhook/fal] OK but no URL for project ${project.id}. Keys:`, Object.keys(output), "payload_error=", payload.payload_error);
    // Fail + refund atomically
    const creditCost = project.creditCharge;
    const won = await failAndRefund(project.id, project.userId, creditCost, project.thumbnailUrl!);
    if (won) {
      const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, project.userId));
      if (owner) {
        import("../lib/email").then(({ sendRenderFailedEmail }) =>
          sendRenderFailedEmail(owner.email, owner.name ?? "", project.title, project.id, creditCost).catch(() => {})
        );
      }
    }
  }

}
