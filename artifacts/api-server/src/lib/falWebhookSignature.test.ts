import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { readFalWebhookHeaders, verifyFalWebhookSignature } from "./falWebhookSignature";

function signedFixture(body: Buffer, nowMs: number) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const timestamp = String(Math.floor(nowMs / 1000));
  const headers = {
    requestId: "request-123",
    userId: "fal-user-123",
    timestamp,
    signature: "",
  };
  const digest = createHash("sha256").update(body).digest("hex");
  const message = Buffer.from([headers.requestId, headers.userId, timestamp, digest].join("\n"));
  headers.signature = sign(null, message, privateKey).toString("hex");
  return { headers, key: publicKey.export({ format: "jwk" }) };
}

test("accepts an authentic, current fal webhook signature", async () => {
  const nowMs = Date.parse("2026-09-01T12:00:00Z");
  const body = Buffer.from(JSON.stringify({ request_id: "request-123", status: "OK", payload: {} }));
  const fixture = signedFixture(body, nowMs);
  assert.equal(await verifyFalWebhookSignature(body, fixture.headers, { nowMs, keys: [fixture.key] }), true);
});

test("rejects tampered bodies, stale timestamps, and missing headers", async () => {
  const nowMs = Date.parse("2026-09-01T12:00:00Z");
  const body = Buffer.from("original");
  const fixture = signedFixture(body, nowMs);
  assert.equal(await verifyFalWebhookSignature(Buffer.from("tampered"), fixture.headers, { nowMs, keys: [fixture.key] }), false);
  assert.equal(await verifyFalWebhookSignature(body, fixture.headers, { nowMs: nowMs + 301_000, keys: [fixture.key] }), false);
  assert.equal(readFalWebhookHeaders({ "x-fal-webhook-request-id": "request-123" }), null);
});

test("reads the exact four fal signature headers", () => {
  assert.deepEqual(readFalWebhookHeaders({
    "x-fal-webhook-request-id": "request-123",
    "x-fal-webhook-user-id": "fal-user-123",
    "x-fal-webhook-timestamp": "1234",
    "x-fal-webhook-signature": "abcd",
  }), {
    requestId: "request-123",
    userId: "fal-user-123",
    timestamp: "1234",
    signature: "abcd",
  });
});
