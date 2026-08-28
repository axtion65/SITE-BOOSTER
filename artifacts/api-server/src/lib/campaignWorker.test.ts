import assert from "node:assert/strict";
import test from "node:test";
import { CampaignError, workerFailureUpdate } from "../agents/errors";
import {
  buildEvidenceLedger,
  validateEvidenceLedger,
} from "../agents/evidence";
import { researchInputSchema } from "../agents/schemas";

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

test("website-import research context produces valid evidence before any provider call", () => {
  const context = {
    identity: { name: "Quae.ai", description: "AI campaign software" },
    products: [
      {
        name: "Campaign software",
        description: "Build grounded campaigns",
        benefits: ["Faster planning"],
      },
    ],
    audienceEvidence: "Small businesses",
    offerEvidence: "Campaign planning",
    ctaEvidence: "Start now",
    campaignBrief: { objective: "Explain Quae.ai" },
  };

  const ledger = buildEvidenceLedger(context);
  assert.equal(validateEvidenceLedger(context, ledger), true);
  assert.doesNotThrow(() =>
    researchInputSchema.parse({
      ledger,
      customerInstruction: JSON.stringify(context.campaignBrief),
    }),
  );
  assert.deepEqual(
    ledger.map(({ source, value }) => ({ source, value })),
    [
      { source: "identity.name", value: "Quae.ai" },
      {
        source: "identity.description",
        value: "AI campaign software",
      },
      { source: "audienceEvidence", value: "Small businesses" },
      { source: "offerEvidence", value: "Campaign planning" },
      { source: "ctaEvidence", value: "Start now" },
      { source: "products.0.name", value: "Campaign software" },
      {
        source: "products.0.description",
        value: "Build grounded campaigns",
      },
      { source: "products.0.benefits[0]", value: "Faster planning" },
    ],
  );
});
