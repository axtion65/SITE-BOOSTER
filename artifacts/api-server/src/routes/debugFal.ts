/**
 * POST /api/debug/fal-video-test
 *
 * Minimal isolated test: submit one LTX 2.3 Fast job directly via the
 * official @fal-ai/client singleton, poll to completion, return the video URL.
 * No credits, no auth, no storage, no OpenAI.  Remove after smoke-test.
 */
import { Router } from "express";
import { fal } from "@fal-ai/client";
import { resolveUserFromToken } from "./auth";

const router = Router();

const MODEL   = "fal-ai/ltx-2.3/text-to-video/fast";
const DEFAULT_PROMPT = "A purple sneaker rotating slowly on a clean studio background, cinematic product advertisement";
const POLL_MS = 4000;   // 4 s between status checks
const TIMEOUT = 300000; // 5 min hard stop

router.post("/debug/fal-video-test", async (req, res) => {
  const user = await resolveUserFromToken(req.headers.authorization);
  if (!user?.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : DEFAULT_PROMPT;
  if (!prompt || prompt.length > 2000) { res.status(400).json({ error: "Prompt must be 1–2,000 characters" }); return; }
  if (req.body?.confirmProviderCost !== true) { res.status(400).json({ error: "Explicit provider-cost confirmation is required" }); return; }
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    res.status(500).json({ error: "FAL_KEY not set" });
    return;
  }

  // Configure the official singleton client with the API key
  fal.config({ credentials: falKey });

  console.log(`[fal-debug] model="${MODEL}"`);
  const started = Date.now();

  // ── 1. Enqueue ────────────────────────────────────────────────────────────
  let requestId: string;
  try {
    const enqueued = await (fal.queue as any).submit(MODEL, {
      input: {
        prompt,
        num_frames: 121,
        negative_prompt: "low quality, blurry, watermark, text overlay, distorted faces",
      },
    });
    requestId = enqueued.request_id;
    console.log(`[fal-debug] enqueued request_id="${requestId}"`);
  } catch (err: any) {
    const body = err?.body ?? err?.message ?? String(err);
    const status = err?.status ?? 500;
    console.error(`[fal-debug] submit FAILED status=${status}:`, body);
    res.status(500).json({ error: "fal.ai submit failed", http_status: status, body });
    return;
  }

  // ── 2. Poll until COMPLETED or FAILED ─────────────────────────────────────
  while (true) {
    if (Date.now() - started > TIMEOUT) {
      console.error(`[fal-debug] TIMEOUT after ${TIMEOUT / 1000}s`);
      res.status(504).json({ error: "Timed out waiting for fal.ai", request_id: requestId });
      return;
    }

    let pollStatus: string;
    try {
      const statusRes = await (fal.queue as any).status(MODEL, { requestId, logs: true });
      pollStatus = statusRes?.status ?? "UNKNOWN";
      console.log(`[fal-debug] request_id="${requestId}" status="${pollStatus}" elapsed=${Math.round((Date.now() - started) / 1000)}s`);
    } catch (err: any) {
      const body = err?.body ?? err?.message ?? String(err);
      const httpStatus = err?.status ?? 500;
      console.error(`[fal-debug] status poll FAILED http=${httpStatus}:`, body);
      res.status(500).json({ error: "fal.ai status poll failed", request_id: requestId, http_status: httpStatus, body });
      return;
    }

    if (pollStatus === "FAILED") {
      console.error(`[fal-debug] job FAILED for request_id="${requestId}"`);
      res.status(500).json({ error: "fal.ai job FAILED", request_id: requestId });
      return;
    }

    if (pollStatus === "COMPLETED") break;

    await new Promise(r => setTimeout(r, POLL_MS));
  }

  // ── 3. Fetch result ────────────────────────────────────────────────────────
  let raw: any;
  try {
    raw = await (fal.queue as any).result(MODEL, { requestId });
    console.log("[fal-debug] result keys:", Object.keys(raw ?? {}));
    console.log("[fal-debug] full result:", JSON.stringify(raw).slice(0, 2000));
  } catch (err: any) {
    const body = err?.body ?? err?.message ?? String(err);
    const httpStatus = err?.status ?? 500;
    console.error(`[fal-debug] result fetch FAILED http=${httpStatus}:`, body);
    res.status(500).json({ error: "fal.ai result fetch failed", request_id: requestId, http_status: httpStatus, body });
    return;
  }

  // ── 4. Extract video URL from all known output shapes ─────────────────────
  const out: any = raw?.data ?? raw;
  const videoUrl: string | null =
    out?.video?.url     ??
    out?.video_url      ??
    out?.url            ??
    out?.videos?.[0]?.url ??
    out?.video          ??
    raw?.video?.url     ??
    raw?.video_url      ??
    null;

  if (!videoUrl || typeof videoUrl !== "string") {
    console.error("[fal-debug] COMPLETED but no video URL. raw:", JSON.stringify(raw).slice(0, 1000));
    res.status(500).json({ error: "Job completed but no video URL found", request_id: requestId, raw });
    return;
  }

  const elapsed = Math.round((Date.now() - started) / 1000);
  console.log(`[fal-debug] ✓ SUCCESS in ${elapsed}s — video_url=${videoUrl}`);

  res.json({
    ok:          true,
    model:       MODEL,
    request_id:  requestId,
    video_url:   videoUrl,
    elapsed_sec: elapsed,
  });
});

export default router;
