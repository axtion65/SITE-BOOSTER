import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { safeErrorMetadata } from "./safeErrorMetadata";

test("safe error metadata preserves operational labels without provider content", () => {
  const error = Object.assign(new Error("customer@example.com https://signed.example/private?token=secret"), {
    body: "private provider response",
    code: "rate_limit_exceeded",
    status: 429,
    response: { data: { prompt: "private campaign" } },
  });

  assert.deepEqual(safeErrorMetadata(error), {
    errorType: "Error",
    errorCode: "rate_limit_exceeded",
    httpStatus: 429,
  });
  const serialized = JSON.stringify(safeErrorMetadata(error));
  assert.doesNotMatch(serialized, /customer|signed|secret|private|prompt/i);
});

test("unsafe provider-controlled labels are discarded", () => {
  assert.deepEqual(safeErrorMetadata({
    name: "Error\ncustomer@example.com",
    code: "bad code https://private.example",
    status: 999,
  }), { errorType: "OperationalError" });
});

test("provider boundaries never log or return raw response content", async () => {
  const sources = await Promise.all([
    "../routes/studio.ts",
    "./falvideo.ts",
    "../routes/debugFal.ts",
    "../routes/webhooks.ts",
    "./shotstack.ts",
    "./tts.ts",
  ].map(path => readFile(new URL(path, import.meta.url), "utf8")));

  const riskyLogLines = sources.flatMap(source => source.split("\n")).filter(line =>
    /console\.(?:log|warn|error)/.test(line)
    && /text\.slice|JSON\.stringify\(raw|payload(?:_error|\.error)|video_url=.*\$\{|,\s*(?:err|body)\s*\)/.test(line),
  );
  assert.deepEqual(riskyLogLines, []);

  const debugSource = sources[2]!;
  assert.doesNotMatch(debugSource, /json\(\{[^}\n]*\b(?:body|raw)\b/);
});
