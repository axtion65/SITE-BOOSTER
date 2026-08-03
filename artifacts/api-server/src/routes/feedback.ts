import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { resolveUserFromToken } from "./auth";

const router = Router();

// POST /api/feedback — store user feedback
router.post("/feedback", async (req, res) => {
  const { type, message, email } = req.body as {
    type?: string; message?: string; email?: string;
  };

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  try {
    // Store in DB using a simple raw insert (no schema needed — uses jsonb log table pattern)
    await db.execute(sql`
      INSERT INTO feedback (type, message, email, created_at)
      VALUES (${type ?? "other"}, ${message.trim()}, ${email?.trim() ?? null}, NOW())
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
        VALUES (${type ?? "other"}, ${message.trim()}, ${email?.trim() ?? null}, NOW())
      `);
    } catch (err) {
      console.error("[feedback] DB error:", err);
      // Still return success — don't let a DB error block the user
    }
  }

  console.log(`[feedback] ${type ?? "other"}: "${message.trim().slice(0, 80)}" ${email ? `<${email}>` : ""}`);
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
