import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { allowedBrowserOrigins, isAllowedBrowserOrigin } from "./corsPolicy";

test("production accepts only Quae and explicitly configured browser origins", () => {
  const env = {
    NODE_ENV: "production",
    APP_URL: "https://app.quae.example/studio",
    CORS_ALLOWED_ORIGINS:
      "https://preview.example,not-a-url,ftp://files.example",
  };
  assert.deepEqual([...allowedBrowserOrigins(env)].sort(), [
    "https://app.quae.example",
    "https://preview.example",
    "https://quae.ai",
    "https://www.quae.ai",
  ]);
  for (const origin of [
    "https://quae.ai",
    "https://www.quae.ai",
    "https://app.quae.example",
    "https://preview.example",
  ])
    assert.equal(isAllowedBrowserOrigin(origin, env), true);
});

test("production rejects malformed, insecure, and lookalike origins", () => {
  const env = { NODE_ENV: "production" };
  for (const origin of [
    "null",
    "https://quae.ai.evil.example",
    "http://quae.ai",
    "https://evil.example",
    "javascript:alert(1)",
  ])
    assert.equal(isAllowedBrowserOrigin(origin, env), false, origin);
});

test("non-browser clients remain valid and local development stays usable", () => {
  assert.equal(
    isAllowedBrowserOrigin(undefined, { NODE_ENV: "production" }),
    true,
  );
  for (const origin of [
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://[::1]:8080",
  ])
    assert.equal(
      isAllowedBrowserOrigin(origin, { NODE_ENV: "development" }),
      true,
    );
  assert.equal(
    isAllowedBrowserOrigin("https://localhost.evil.example", {
      NODE_ENV: "development",
    }),
    false,
  );
});

test("the API rejects unknown browser origins before mounting application routes", async () => {
  const source = await readFile(new URL("../app.ts", import.meta.url), "utf8");
  const guard = source.indexOf("isAllowedBrowserOrigin(origin)");
  const routes = source.indexOf('app.use("/api", router)');
  assert.ok(guard >= 0);
  assert.ok(routes > guard);
  assert.match(
    source,
    /status\(403\)\.json\(\{ error: "Origin not allowed" \}\)/,
  );
  assert.doesNotMatch(source, /app\.use\(cors\(\)\)/);
});
