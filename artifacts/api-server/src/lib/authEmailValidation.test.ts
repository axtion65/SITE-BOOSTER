import assert from "node:assert/strict";
import test from "node:test";
import {
  ForgotPasswordBody,
  SignInBody,
  SignUpBody,
} from "@workspace/api-zod";

test("public authentication endpoints reject malformed email addresses", () => {
  for (const email of ["not-an-email", "missing-domain@", "@missing-user.com", " user@example.com "]) {
    assert.equal(SignInBody.safeParse({ email, password: "secret1" }).success, false, email);
    assert.equal(SignUpBody.safeParse({ email, password: "secret12" }).success, false, email);
    assert.equal(ForgotPasswordBody.safeParse({ email }).success, false, email);
  }
});

test("public authentication endpoints still accept a valid email address", () => {
  const email = "customer@example.com";
  assert.equal(SignInBody.safeParse({ email, password: "secret1" }).success, true);
  assert.equal(SignUpBody.safeParse({ email, password: "secret12" }).success, true);
  assert.equal(ForgotPasswordBody.safeParse({ email }).success, true);
});
