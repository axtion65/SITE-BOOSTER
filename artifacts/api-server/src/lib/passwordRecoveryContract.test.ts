import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authRoute = readFileSync(
  new URL("../routes/auth.ts", import.meta.url),
  "utf8",
);
const emailService = readFileSync(
  new URL("./email.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../../../../lib/db/migrations/0019_secure_password_recovery.sql",
    import.meta.url,
  ),
  "utf8",
);
const signInPage = readFileSync(
  new URL("../../../quae/src/pages/signin.tsx", import.meta.url),
  "utf8",
);

test("forgot-password never changes or returns a password", () => {
  const forgotRoute = authRoute.slice(
    authRoute.indexOf('router.post("/auth/forgot-password"'),
    authRoute.indexOf('router.post("/auth/reset-password"'),
  );
  assert.doesNotMatch(forgotRoute, /tempPassword|passwordHash:/);
  assert.match(forgotRoute, /res\.json\(\{ accepted: true \}\)/);
  assert.match(forgotRoute, /tokenHash: reset\.tokenHash/);
});

test("reset-password atomically consumes one unexpired token", () => {
  const resetRoute = authRoute.slice(
    authRoute.indexOf('router.post("/auth/reset-password"'),
    authRoute.indexOf('router.get("/auth/me"'),
  );
  assert.match(resetRoute, /db\.transaction/);
  assert.match(resetRoute, /isNull\(passwordResetTokensTable\.usedAt\)/);
  assert.match(resetRoute, /gt\(passwordResetTokensTable\.expiresAt, now\)/);
  assert.match(resetRoute, /\.set\(\{ usedAt: now \}\)/);
});

test("raw reset credentials are absent from durable storage and the browser", () => {
  assert.match(migration, /token_hash TEXT NOT NULL/);
  assert.doesNotMatch(migration, /temp_password|raw_token/);
  assert.match(emailService, /queueOnFailure: false/);
  assert.doesNotMatch(signInPage, /tempPassword|emailjs|Temporary password/);
  assert.match(signInPage, /useResetPassword/);
});
