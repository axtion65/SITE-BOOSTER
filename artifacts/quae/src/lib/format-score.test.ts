import assert from "node:assert/strict";
import test from "node:test";
import { formatScore } from "./format-score";

test("customer judge scores hide floating-point noise", () => {
  assert.equal(formatScore(69.19999999999999), "69.2");
  assert.equal(formatScore(70.3), "70.3");
  assert.equal(formatScore(70), "70");
});
