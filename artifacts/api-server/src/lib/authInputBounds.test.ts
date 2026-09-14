import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ForgotPasswordBody,
  ResetPasswordBody,
  SignInBody,
  SignUpBody,
  forgotPasswordBodyEmailMax,
  resetPasswordBodyNewPasswordMax,
  resetPasswordBodyTokenMax,
  signInBodyPasswordMax,
  signUpBodyEmailMax,
  signUpBodyNameMax,
  signUpBodyPasswordMax,
} from "@workspace/api-zod";
import { ChangePasswordBody } from "./authInput";

const validEmail = "customer@example.com";

test("public identity and password inputs have explicit upper bounds", () => {
  assert.deepEqual(
    {
      forgotEmail: forgotPasswordBodyEmailMax,
      resetPassword: resetPasswordBodyNewPasswordMax,
      resetToken: resetPasswordBodyTokenMax,
      signInPassword: signInBodyPasswordMax,
      signUpEmail: signUpBodyEmailMax,
      signUpName: signUpBodyNameMax,
      signUpPassword: signUpBodyPasswordMax,
    },
    {
      forgotEmail: 254,
      resetPassword: 128,
      resetToken: 512,
      signInPassword: 128,
      signUpEmail: 254,
      signUpName: 100,
      signUpPassword: 128,
    },
  );
  assert.equal(SignUpBody.safeParse({ email: validEmail, password: "p".repeat(128), name: "n".repeat(100) }).success, true);
  assert.equal(SignUpBody.safeParse({ email: validEmail, password: "p".repeat(129) }).success, false);
  assert.equal(SignUpBody.safeParse({ email: validEmail, password: "password", name: "n".repeat(101) }).success, false);
  assert.equal(SignInBody.safeParse({ email: validEmail, password: "p".repeat(129) }).success, false);
  assert.equal(ForgotPasswordBody.safeParse({ email: `${"a".repeat(244)}@example.com` }).success, false);
  assert.equal(ResetPasswordBody.safeParse({ token: "t".repeat(513), newPassword: "password" }).success, false);
  assert.equal(ResetPasswordBody.safeParse({ token: "t".repeat(32), newPassword: "p".repeat(129) }).success, false);
});

test("change-password applies the same bounded policy", () => {
  const valid = { email: validEmail, currentPassword: "current-password", newPassword: "new-password" };
  assert.equal(ChangePasswordBody.safeParse(valid).success, true);
  assert.equal(ChangePasswordBody.safeParse({ ...valid, currentPassword: "p".repeat(129) }).success, false);
  assert.equal(ChangePasswordBody.safeParse({ ...valid, newPassword: "p".repeat(129) }).success, false);
});

test("web and mobile signup forms stop oversized values before submission", () => {
  const web = readFileSync(new URL("../../../quae/src/pages/signin.tsx", import.meta.url), "utf8");
  const mobile = readFileSync(new URL("../../../quae-mobile/app/(auth)/sign-up.tsx", import.meta.url), "utf8");

  assert.match(web, /id="name-signup"[\s\S]*?maxLength=\{100\}/);
  assert.match(web, /id="email-signup"[\s\S]*?maxLength=\{254\}/);
  assert.match(web, /id="password-signup"[\s\S]*?maxLength=\{128\}/);
  assert.match(mobile, /placeholder="Your name"[\s\S]*?maxLength=\{100\}/);
  assert.match(mobile, /placeholder="you@company\.com"[\s\S]*?maxLength=\{254\}/);
  assert.match(mobile, /placeholder="Min\. 8 characters"[\s\S]*?maxLength=\{128\}/);
});
