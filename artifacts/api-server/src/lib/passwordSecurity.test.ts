import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { hashPassword, verifyPassword } from "./passwordSecurity";
import {
  createPasswordResetToken,
  hashPasswordResetToken,
  PASSWORD_RESET_TTL_MS,
  passwordResetUrl,
} from "./passwordRecovery";

test("scrypt password hashes are salted and verify without exposing the password", async () => {
  const first = await hashPassword("correct horse battery staple");
  const second = await hashPassword("correct horse battery staple");
  assert.notEqual(first, second);
  assert.match(first, /^scrypt\$v1\$/);
  assert.deepEqual(
    await verifyPassword("correct horse battery staple", first),
    {
      valid: true,
      needsRehash: false,
    },
  );
  assert.deepEqual(await verifyPassword("wrong", first), {
    valid: false,
    needsRehash: false,
  });
});

test("legacy passwords still work once and are marked for lazy migration", async () => {
  const legacy = createHash("sha256")
    .update("old password" + "quae_salt_2024")
    .digest("hex");
  assert.deepEqual(await verifyPassword("old password", legacy), {
    valid: true,
    needsRehash: true,
  });
  assert.equal((await verifyPassword("wrong", legacy)).valid, false);
  assert.equal(
    (await verifyPassword("old password", "bad-format")).valid,
    false,
  );
});

test("reset tokens are random, hash-only, short-lived, and URL encoded", () => {
  const now = Date.parse("2026-09-05T00:00:00.000Z");
  const first = createPasswordResetToken(now);
  const second = createPasswordResetToken(now);
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.tokenHash, second.tokenHash);
  assert.equal(first.tokenHash, hashPasswordResetToken(first.token));
  assert.equal(first.expiresAt.getTime(), now + PASSWORD_RESET_TTL_MS);
  assert.equal(
    passwordResetUrl(first.token, "https://quae.ai").startsWith(
      "https://quae.ai/signin?resetToken=",
    ),
    true,
  );
});
