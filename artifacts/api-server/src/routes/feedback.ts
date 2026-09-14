import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { resolveUserFromToken } from "./auth";
import { createRateLimitMiddleware } from "../lib/rateLimit";
import { logger } from "../lib/logger";

const router = Router();
const FEEDBACK_TYPES = new Set<string>(["idea", "bug", "other"]);
const MAX_FEEDBACK_MESSAGE_LENGTH = 4000;
const MAX_FEEDBACK_EMAIL_LENGTH = 320;
const feedbackRateLimit = createRateLimitMiddleware({
  scope: "feedback.create.client",
  limit: 10,
  globalLimit: 300,
  windowMs: 60 * 60 * 1000,
});

// POST /api/feedback — store user feedback
router.post("/feedback", feedbackRateLimit, async (req, res) => {
  const { type, message, email } = req.body as {
    type?: string; message?: string; email?: string;
  };

  const normalizedMessage = typeof message === "string" ? message.trim() : "";
  const normalizedEmail = typeof email === "string" ? email.trim() : "";
  const normalizedType = typeof type === "string" ? type : "other";

  if (!normalizedMessage) {
    res.status(400).json({ error: "message is required" });
    return;
  }
  if (normalizedMessage.length > MAX_FEEDBACK_MESSAGE_LENGTH) {
    res.status(400).json({ error: `message must be ${MAX_FEEDBACK_MESSAGE_LENGTH} characters or fewer` });
    return;
  }
  if (normalizedEmail.length > MAX_FEEDBACK_EMAIL_LENGTH) {
    res.status(400).json({ error: `email must be ${MAX_FEEDBACK_EMAIL_LENGTH} characters or fewer` });
    return;
  }
  if (!FEEDBACK_TYPES.has(normalizedType)) {
    res.status(400).json({ error: "invalid feedback type" });
    return;
  }

  try {
    // Store in DB using a simple raw insert (no schema needed — uses jsonb log table pattern)
    await db.execute(sql`
      INSERT INTO feedback (type, message, email, created_at)
      VALUES (${normalizedType}, ${normalizedMessage}, ${normalizedEmail || null}, NOW())
    `);
  } catch {
    // If the table doesn't exist yet, create it and retry
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS feedback (
          id SERIAL PRIMARY KEY,
          type TEXT NOT NULL DEFAULT 'other',
          message TEXT NOT NULL,
          email TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute(sql`
        INSERT INTO feedback (type, message, email, created_at)
        VALUES (${normalizedType}, ${normalizedMessage}, ${normalizedEmail || null}, NOW())
      `);
    } catch (err) {
      console.error("[feedback] DB error:", err);
      res.status(500).json({ error: "Failed to save feedback" });
      return;
    }
  }

  logger.info({ event: "feedback.stored", type: normalizedType }, "Feedback stored");
  res.json({ ok: true });
});

// GET /api/admin/feedback — view all feedback (admin only)
router.get("/admin/feedback", async (req, res) => {
  const user = await resolveUserFromToken(req.headers.authorization);
  if (!user?.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  try {
    const rows = await db.execute(sql`
      SELECT id, type, message, email, created_at FROM feedback ORDER BY created_at DESC LIMIT 200
    `);
    res.json(rows.rows ?? rows);
  } catch {
    res.json([]);
  }
});

export default router;
