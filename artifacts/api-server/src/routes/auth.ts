import { Router } from "express";
import { db, passwordResetTokensTable, usersTable } from "@workspace/db";
import { and, eq, gt, isNull } from "drizzle-orm";
import { SignInBody, SignUpBody, ForgotPasswordBody, ResetPasswordBody } from "@workspace/api-zod";
import * as crypto from "crypto";
import { PLAN_BY_SLUG } from "@workspace/plans";
import { hashPassword, verifyPassword } from "../lib/passwordSecurity";
import {
  createPasswordResetToken,
  hashPasswordResetToken,
  passwordResetUrl,
} from "../lib/passwordRecovery";
import { sendPasswordResetEmail } from "../lib/email";

const router = Router();

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hmacSign(payload: string): string {
  const secret = process.env.SESSION_SECRET ?? "dev-secret-change-me";
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function generateToken(userId: string): string {
  const ts = Date.now();
  const payload = `${userId}:${ts}`;
  const sig = hmacSign(payload);
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

/** Short-lived token used only for audited admin impersonation sessions. */
export function generateImpersonationToken(userId: string): string {
  const ts = Date.now();
  const expiresAt = ts + 15 * 60 * 1000;
  const payload = `${userId}:${ts}:${expiresAt}`;
  const sig = hmacSign(payload);
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

/** Shared token → user resolution used by every authenticated endpoint. */
export async function resolveUserFromToken(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split(":");
    // Standard: userId:timestamp:hmac. Impersonation: userId:timestamp:expiry:hmac.
    if (parts.length !== 3 && parts.length !== 4) return null;
    const userId = parts[0];
    const ts = Number(parts[1]);
    const impersonationExpiry = parts.length === 4 ? Number(parts[2]) : null;
    const sig = parts.at(-1)!;
    if (!userId || Number.isNaN(ts)) return null;

    // Verify HMAC signature (timing-safe)
    const payload = impersonationExpiry === null ? `${userId}:${ts}` : `${userId}:${ts}:${impersonationExpiry}`;
    const expected = hmacSign(payload);
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) {
      return null; // tampered
    }
    // Enforce expiry
    if (Date.now() - ts > TOKEN_TTL_MS) return null;
    if (impersonationExpiry !== null && (Number.isNaN(impersonationExpiry) || Date.now() > impersonationExpiry)) return null;

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    return user?.accountStatus === "disabled" ? null : (user ?? null);
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
    accountStatus: user.accountStatus,
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
  const verification = user ? await verifyPassword(password, user.passwordHash) : null;
  if (!user || !verification?.valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  if (user.accountStatus === "disabled") {
    res.status(403).json({ error: "This account has been disabled" });
    return;
  }
  if (verification.needsRehash) {
    await db.update(usersTable)
      .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));
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
    passwordHash: await hashPassword(password),
    plan: "free",
    credits: PLAN_BY_SLUG.free.credits,
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
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash)).valid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  await db.update(usersTable)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));
  res.json({ user: userToPublic(user), token: generateToken(user.id) });
});

router.post("/auth/forgot-password", async (req, res) => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { email } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (user?.accountStatus === "active") {
    const reset = createPasswordResetToken();
    await db.transaction(async (tx) => {
      await tx.update(passwordResetTokensTable)
        .set({ usedAt: new Date() })
        .where(and(
          eq(passwordResetTokensTable.userId, user.id),
          isNull(passwordResetTokensTable.usedAt),
        ));
      await tx.insert(passwordResetTokensTable).values({
        userId: user.id,
        tokenHash: reset.tokenHash,
        expiresAt: reset.expiresAt,
      });
    });

    const sent = await sendPasswordResetEmail(
      user.email,
      user.name ?? "",
      passwordResetUrl(reset.token),
    );
    if (!sent) {
      await db.update(passwordResetTokensTable)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokensTable.tokenHash, reset.tokenHash));
    }
  }
  // Always return the same response so the endpoint does not reveal accounts.
  res.json({ accepted: true });
});

router.post("/auth/reset-password", async (req, res) => {
  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid reset request" });
    return;
  }

  const now = new Date();
  const tokenHash = hashPasswordResetToken(parsed.data.token);
  const passwordHash = await hashPassword(parsed.data.newPassword);
  const user = await db.transaction(async (tx) => {
    const [claimed] = await tx.update(passwordResetTokensTable)
      .set({ usedAt: now })
      .where(and(
        eq(passwordResetTokensTable.tokenHash, tokenHash),
        isNull(passwordResetTokensTable.usedAt),
        gt(passwordResetTokensTable.expiresAt, now),
      ))
      .returning({ userId: passwordResetTokensTable.userId });
    if (!claimed) return null;

    const [updated] = await tx.update(usersTable)
      .set({ passwordHash, updatedAt: now })
      .where(and(
        eq(usersTable.id, claimed.userId),
        eq(usersTable.accountStatus, "active"),
      ))
      .returning();
    return updated ?? null;
  });

  if (!user) {
    res.status(400).json({ error: "This reset link is invalid or has expired" });
    return;
  }
  res.json({ user: userToPublic(user), token: generateToken(user.id) });
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

export default router;
