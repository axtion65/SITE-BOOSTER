import assert from "node:assert/strict";
import test from "node:test";
import { CampaignError, workerFailureUpdate } from "../agents/errors";

test("retryable provider failures receive bounded retries", () => {
  assert.deepEqual(workerFailureUpdate({ status: 429 }, 0), {
    code: "PROVIDER_RATE_LIMIT",
    retryable: true,
    retry: true,
    status: "queued",
  });
  assert.equal(workerFailureUpdate({ status: 503 }, 2).status, "failed");
});

test("permanent pipeline failures preserve useful codes and never retry", () => {
  const invalidLedger = workerFailureUpdate(
    new CampaignError("INVALID_EVIDENCE_LEDGER", "permanent"),
    0,
  );
  assert.equal(invalidLedger.code, "INVALID_EVIDENCE_LEDGER");
  assert.equal(invalidLedger.retry, false);
  assert.equal(invalidLedger.status, "failed");
  assert.equal(
    workerFailureUpdate(new Error("SCHEMA_INVALID"), 0).code,
    "SCHEMA_REPAIR_EXHAUSTED",
  );
});
