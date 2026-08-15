import assert from "node:assert/strict";
import test from "node:test";

import { consumeUploadIntent, issueUploadIntent, MAX_UPLOAD_SIZE_BYTES, validateUpload } from "./uploadSecurity";

test("upload validation continues to reject unsupported MIME types", () => {
  assert.match(validateUpload(10, "image/svg+xml") ?? "", /Unsupported file type/);
});

test("upload validation continues to reject oversized files", () => {
  assert.match(validateUpload(MAX_UPLOAD_SIZE_BYTES + 1, "image/png") ?? "", /File too large/);
  assert.equal(validateUpload(MAX_UPLOAD_SIZE_BYTES, "image/png"), null);
});

test("finalize intents remain ownership scoped and single use", () => {
  const wrongOwnerToken = issueUploadIntent("owner", "/objects/a");
  assert.equal(consumeUploadIntent(wrongOwnerToken, "attacker", "/objects/a"), null);
  assert.equal(consumeUploadIntent(wrongOwnerToken, "owner", "/objects/a"), null, "failed attempt consumes token");

  const wrongPathToken = issueUploadIntent("owner", "/objects/a");
  assert.equal(consumeUploadIntent(wrongPathToken, "owner", "/objects/b"), null);

  const validToken = issueUploadIntent("owner", "/objects/a");
  assert.equal(consumeUploadIntent(validToken, "owner", "/objects/a")?.userId, "owner");
  assert.equal(consumeUploadIntent(validToken, "owner", "/objects/a"), null);
});
