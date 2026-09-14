import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isSessionCurrent } from "./sessionSecurity";

test("password security boundaries invalidate every older session", () => {
  const invalidBefore = new Date("2026-09-14T08:00:00.000Z");

  assert.equal(isSessionCurrent(invalidBefore.getTime() - 1, invalidBefore), false);
  assert.equal(isSessionCurrent(invalidBefore.getTime(), invalidBefore), true);
  assert.equal(isSessionCurrent(invalidBefore.getTime() + 1, invalidBefore), true);
  assert.equal(isSessionCurrent(Date.now(), null), true);
});

test("password change and reset persist the revocation boundary", () => {
  const authRoute = readFileSync(new URL("../routes/auth.ts", import.meta.url), "utf8");
  const changePassword = authRoute.slice(
    authRoute.indexOf('router.post("/auth/change-password"'),
    authRoute.indexOf('router.post("/auth/forgot-password"'),
  );
  const resetPassword = authRoute.slice(
    authRoute.indexOf('router.post("/auth/reset-password"'),
    authRoute.indexOf('router.get("/auth/me"'),
  );

  assert.match(changePassword, /sessionInvalidBefore: now/);
  assert.match(resetPassword, /sessionInvalidBefore: now/);
  assert.match(authRoute, /isSessionCurrent\(ts, user\.sessionInvalidBefore\)/);
});
