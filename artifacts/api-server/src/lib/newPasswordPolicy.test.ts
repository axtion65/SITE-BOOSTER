import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ResetPasswordBody, SignInBody, SignUpBody } from "@workspace/api-zod";

test("new and reset passwords require at least eight characters", () => {
  assert.equal(SignUpBody.safeParse({ email: "customer@example.com", password: "short7" }).success, false);
  assert.equal(SignUpBody.safeParse({ email: "customer@example.com", password: "long-enough" }).success, true);
  assert.equal(ResetPasswordBody.safeParse({ token: "x".repeat(32), newPassword: "short7" }).success, false);
  assert.equal(ResetPasswordBody.safeParse({ token: "x".repeat(32), newPassword: "long-enough" }).success, true);
});

test("existing six-character passwords remain eligible for sign-in", () => {
  assert.equal(SignInBody.safeParse({ email: "customer@example.com", password: "sixsix" }).success, true);
});

test("web, mobile, and change-password flows explain and enforce the same minimum", async () => {
  const [api, web, mobile] = await Promise.all([
    readFile(new URL("../routes/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../quae/src/pages/signin.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../quae-mobile/app/(auth)/sign-up.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(api, /newPassword\.length < 8/);
  assert.match(api, /at least 8 characters/);
  for (const source of [web, mobile]) {
    assert.match(source, /at least 8 characters/i);
    assert.doesNotMatch(source, /at least 6 characters/i);
  }
});
