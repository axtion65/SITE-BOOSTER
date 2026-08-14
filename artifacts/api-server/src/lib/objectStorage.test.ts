import assert from "node:assert/strict";
import test from "node:test";

process.env.AWS_ENDPOINT_URL ||= "http://storage.test";
process.env.AWS_S3_BUCKET_NAME ||= "private-test-bucket";
process.env.AWS_ACCESS_KEY_ID ||= "test";
process.env.AWS_SECRET_ACCESS_KEY ||= "test";

const { validateVideoPayload, videoObjectName } = await import("./objectStorage");

function mp4(payload = "video-data"): Buffer {
  return Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.from(payload)]);
}

test("durable video keys are deterministic and scoped to user, project, and render", () => {
  const identity = { userId: "user-1", projectId: "project-1", renderId: "render-1" };
  assert.equal(videoObjectName(identity), "videos/user-1/project-1/render-1.mp4");
  assert.equal(videoObjectName(identity), videoObjectName(identity), "duplicate polling reuses the object key");
  assert.notEqual(videoObjectName(identity), videoObjectName({ ...identity, renderId: "render-2" }), "rerenders get a new durable object");
  assert.notEqual(videoObjectName(identity), videoObjectName({ ...identity, userId: "user-2" }), "users cannot collide");
});

test("accepts a non-empty MP4 provider response", () => {
  assert.doesNotThrow(() => validateVideoPayload(mp4(), "video/mp4"));
  assert.doesNotThrow(() => validateVideoPayload(mp4(), "application/octet-stream"));
});

test("rejects provider XML, HTML, and JSON error documents", () => {
  assert.throws(() => validateVideoPayload(Buffer.from("<Error>RequestCanceled</Error>"), "application/xml"), /error document/);
  assert.throws(() => validateVideoPayload(Buffer.from("<!doctype html><h1>failure</h1>"), "text/html"), /error document/);
  assert.throws(() => validateVideoPayload(Buffer.from('{"error":"failed"}'), "application/json"), /error document/);
});

test("rejects empty, oversized, and non-MP4 provider output", () => {
  assert.throws(() => validateVideoPayload(Buffer.alloc(0), "video/mp4"), /empty/);
  assert.throws(() => validateVideoPayload(mp4(), "video/mp4", 4), /storage limit/);
  assert.throws(() => validateVideoPayload(Buffer.from("not an mp4"), "video/mp4"), /valid MP4/);
});
