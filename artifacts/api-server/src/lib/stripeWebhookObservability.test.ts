import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const handler = await readFile(
  new URL("../webhookHandlers.ts", import.meta.url),
  "utf8",
);
const ledger = await readFile(
  new URL("./stripeWebhookLedger.ts", import.meta.url),
  "utf8",
);
const admin = await readFile(
  new URL("../routes/admin.ts", import.meta.url),
  "utf8",
);
const adminOperations = admin.slice(
  admin.indexOf('router.get("/admin/operations"'),
  admin.indexOf('router.get("/admin/render-debug"'),
);

test("verified Stripe events record attempts and terminal outcomes", () => {
  const signatureVerification = handler.indexOf(
    "stripe.webhooks.constructEvent",
  );
  const attempt = handler.indexOf(
    "recordStripeWebhookAttempt(event.id",
    signatureVerification,
  );
  assert.ok(signatureVerification >= 0);
  assert.ok(attempt > signatureVerification);
  assert.match(handler, /recordStripeWebhookSuccess\(event\.id\)/);
  assert.match(handler, /recordStripeWebhookFailure\(event\.id, error\)/);
  assert.match(handler, /throw error/);
});

test("the Stripe event ledger is retry-aware and stores no webhook payload", () => {
  assert.match(ledger, /eventId: string/);
  assert.match(ledger, /eventType: string/);
  assert.match(
    ledger,
    /attempts: sql`\$\{stripeWebhookEventsTable\.attempts\} \+ 1`/,
  );
  assert.match(ledger, /already_succeeded/);
  assert.match(ledger, /JSON\.stringify\(safeErrorMetadata\(error\)\)/);
  assert.doesNotMatch(ledger, /error\.message|String\(error\)/);
  assert.doesNotMatch(ledger, /payload|signature|payment_method|card/i);
});

test("Admin reports the current failed Stripe webhook count", () => {
  assert.match(adminOperations, /from\(stripeWebhookEventsTable\)/);
  assert.match(
    adminOperations,
    /eq\(stripeWebhookEventsTable\.status, "failed"\)/,
  );
  assert.match(adminOperations, /failedStripeWebhooks: Number/);
  assert.doesNotMatch(adminOperations, /failedStripeWebhooks:\s*null/);
});
