import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const signIn = readFileSync(new URL("../pages/signin.tsx", import.meta.url), "utf8");

test("authentication has one page-level heading for assistive navigation", () => {
  assert.match(signIn, /<h1 className="sr-only">Sign in or create your Quae\.ai account<\/h1>/);
});
