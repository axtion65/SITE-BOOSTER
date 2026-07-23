import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SignInBody, SignUpBody, ForgotPasswordBody } from "@workspace/api-zod";
import * as crypto from "crypto";

const router = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "quae_salt_2024").digest("hex");
}

function generateToken(userId: string): string {
  return Buffer.from(`${userId}:${Date.now()}`).toString("base64url");
}

function generateTempPassword(): string {
  return crypto.randomBytes(6).toString("hex");
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
  res.status(201).json({ user: userToPublic(user), token: generateToken(user.id) });
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
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const token = auth.slice(7);
  const decoded = Buffer.from(token, "base64url").toString("utf-8");
  const userId = decoded.split(":")[0];
  if (!userId) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json(userToPublic(user));
});

router.post("/auth/signout", (_req, res) => {
  res.json({ success: true });
});

// One-time setup: promote an email to admin (only works when zero admins exist)
router.post("/auth/setup-admin", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) { res.status(400).json({ error: "Email required" }); return; }

  const admins = await db.select().from(usersTable).where(eq(usersTable.isAdmin, true));
  if (admins.length > 0) {
    res.status(403).json({ error: "Admin already exists. Use the admin panel to promote more users." });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ isAdmin: true })
    .where(eq(usersTable.email, email.toLowerCase()))
    .returning();

  if (!user) { res.status(404).json({ error: "No account found with that email" }); return; }
  res.json({ success: true, message: `${user.email} is now an admin. You can now log in at /admin.` });
});

export default router;
