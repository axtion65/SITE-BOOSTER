import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { resolveUserFromToken } from "./auth";
import { createRateLimitMiddleware } from "../lib/rateLimit";
import { logger } from "../lib/logger";
import { FeedbackBody } from "../lib/feedbackInput";
import { safeErrorMetadata } from "../lib/safeErrorMetadata";

const router = Router();
const feedbackRateLimit = createRateLimitMiddleware({
  scope: "feedback.create.client",
  limit: 10,
  globalLimit: 300,
  windowMs: 60 * 60 * 1000,
});

// POST /api/feedback — store user feedback
router.post("/feedback", feedbackRateLimit, async (req, res) => {
  const parsed = FeedbackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter feedback and a valid optional reply email" });
    return;
  }
  const normalizedMessage = parsed.data.message;
  const normalizedEmail = parsed.data.email ?? "";
  const normalizedType = parsed.data.type;

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
      console.error("[feedback] Database operation failed", safeErrorMetadata(err));
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
