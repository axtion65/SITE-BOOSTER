import assert from "node:assert/strict";
import test from "node:test";
import { privateImageUrl } from "./marketing-api";

test("private object URLs normalize upload and generated paths exactly once", () => {
  assert.equal(privateImageUrl("/objects/uploads/abc"), "/api/storage/objects/uploads/abc");
  assert.equal(privateImageUrl("/api/storage/objects/uploads/abc"), "/api/storage/objects/uploads/abc");
  assert.equal(privateImageUrl("/objects/mockups/abc"), "/api/storage/objects/mockups/abc");
  assert.equal(privateImageUrl("/api/storage/objects/mockups/abc"), "/api/storage/objects/mockups/abc");
  assert.doesNotMatch(privateImageUrl("/api/storage/objects/foo"), /objects\/\/api\/storage\/objects/);
});
