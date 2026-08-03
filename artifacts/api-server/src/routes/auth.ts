import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SignInBody, SignUpBody, ForgotPasswordBody } from "@workspace/api-zod";
import * as crypto from "crypto";

const router = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "quae_salt_2024").digest("hex");
}

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hmacSign(payload: string): string {
  const secret = process.env.SESSION_SECRET ?? "dev-secret-change-me";
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function generateToken(userId: string): string {
  const ts = Date.now();
  const payload = `${userId}:${ts}`;
  const sig = hmacSign(payload);
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function generateTempPassword(): string {
  return crypto.randomBytes(6).toString("hex");
}

/** Shared token → user resolution used by every authenticated endpoint. */
export async function resolveUserFromToken(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split(":");
    // Signed token format: userId:timestamp:hmac  (exactly 3 parts)
    if (parts.length !== 3) return null; // reject unsigned/malformed tokens
    const userId = parts[0];
    const ts = Number(parts[1]);
    const sig = parts[2];
    if (!userId || Number.isNaN(ts)) return null;

    // Verify HMAC signature (timing-safe)
    const payload = `${userId}:${ts}`;
    const expected = hmacSign(payload);
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) {
      return null; // tampered
    }
    // Enforce expiry
    if (Date.now() - ts > TOKEN_TTL_MS) return null;

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    return user ?? null;
  } catch {
    return null;
  }
}

/** Convenience wrapper that returns only the userId string. */
export async function resolveUserIdFromToken(authHeader: string | undefined): Promise<string | null> {
  const user = await resolveUserFromToken(authHeader);
  return user?.id ?? null;
}

function userToPublic(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    credits: user.credits,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt.toISOString(),
  };
}

router.post("/auth/signin", async (req, res) => {
  const parsed = SignInBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { email, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (!user || user.passwordHash !== hashPassword(password)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  res.json({ user: userToPublic(user), token: generateToken(user.id) });
});

router.post("/auth/signup", async (req, res) => {
  const parsed = SignUpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { email, password, name } = parsed.data;
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (existing) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }
  const [user] = await db.insert(usersTable).values({
    email: email.toLowerCase(),
    name: name ?? null,
    passwordHash: hashPassword(password),
    plan: "free",
    credits: 300,
    isAdmin: false,
  }).returning();
  // Fire-and-forget welcome email
  import("../lib/email").then(({ sendWelcomeEmail }) =>
    sendWelcomeEmail(user.email, user.name ?? "").catch(() => {})
  );
  res.status(201).json({ user: userToPublic(user), token: generateToken(user.id) });
});

router.post("/auth/change-password", async (req, res) => {
  const { email, currentPassword, newPassword } = req.body as {
    email?: string; currentPassword?: string; newPassword?: string;
  };
  if (!email || !currentPassword || !newPassword) {
    res.status(400).json({ error: "email, currentPassword, and newPassword are required" });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: "New password must be at least 6 characters" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (!user || user.passwordHash !== hashPassword(currentPassword)) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  await db.update(usersTable).set({ passwordHash: hashPassword(newPassword) }).where(eq(usersTable.id, user.id));
  res.json({ user: userToPublic(user), token: generateToken(user.id) });
});

router.post("/auth/forgot-password", async (req, res) => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { email } = parsed.data;
  const tempPassword = generateTempPassword();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (user) {
    await db.update(usersTable).set({ passwordHash: hashPassword(tempPassword) }).where(eq(usersTable.id, user.id));
  }
  // Always return success to avoid email enumeration
  res.json({ tempPassword });
});

router.get("/auth/me", async (req, res) => {
  const user = await resolveUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  res.json(userToPublic(user));
});

router.post("/auth/signout", (_req, res) => {
  res.json({ success: true });
});

router.patch("/auth/profile", async (req, res) => {
  const user = await resolveUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }

  const { name } = req.body as { name?: unknown };
  if (typeof name !== "string") {
    res.status(400).json({ error: "name must be a string" });
    return;
  }
  const trimmed = name.trim().slice(0, 100);
  const [updated] = await db
    .update(usersTable)
    .set({ name: trimmed || null })
    .where(eq(usersTable.id, user.id))
    .returning();
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  res.json(userToPublic(updated));
});

// Promote self to admin — requires valid email + password to prove ownership
router.post("/auth/setup-admin", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (!user || user.passwordHash !== hashPassword(password)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ isAdmin: true })
    .where(eq(usersTable.id, user.id))
    .returning();

  res.json({ success: true, message: `${updated.email} is now an admin.`, token: generateToken(updated.id), user: userToPublic(updated) });
});

export default router;
