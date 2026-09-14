import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { Request, Response } from "express";
import { createRateLimitMiddleware, FixedWindowRateLimiter } from "./rateLimit";

test("fixed windows block excess requests and reset on schedule", () => {
  const limiter = new FixedWindowRateLimiter(2, 60_000);
  assert.deepEqual(limiter.consume("customer", 1_000), {
    allowed: true,
    limit: 2,
    remaining: 1,
    retryAfterSeconds: 60,
  });
  assert.equal(limiter.consume("customer", 2_000).allowed, true);
  const blocked = limiter.consume("customer", 3_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterSeconds, 58);
  assert.equal(limiter.consume("customer", 61_000).allowed, true);
});

test("middleware enforces both identity and global ceilings with retry headers", () => {
  let currentTime = 10_000;
  const middleware = createRateLimitMiddleware({
    scope: "test",
    limit: 2,
    globalLimit: 3,
    windowMs: 60_000,
    identity: (req) => String(req.headers["x-test-identity"]),
    now: () => currentTime,
  });

  const run = (identity: string) => {
    const headers = new Map<string, string>();
    let statusCode = 200;
    let body: unknown;
    let nextCalled = false;
    const req = {
      headers: { "x-test-identity": identity },
    } as unknown as Request;
    const res = {
      setHeader(name: string, value: string) {
        headers.set(name, value);
      },
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(value: unknown) {
        body = value;
        return this;
      },
    } as unknown as Response;
    middleware(req, res, () => {
      nextCalled = true;
    });
    return { body, headers, nextCalled, statusCode };
  };

  assert.equal(run("first").nextCalled, true);
  assert.equal(run("first").nextCalled, true);
  const identityBlocked = run("first");
  assert.equal(identityBlocked.statusCode, 429);
  assert.equal(identityBlocked.headers.get("Retry-After"), "60");
  assert.deepEqual(identityBlocked.body, {
    error: "Too many requests. Please wait and try again.",
  });

  const globallyBlocked = run("second");
  assert.equal(globallyBlocked.statusCode, 429);
  assert.equal(globallyBlocked.headers.get("RateLimit-Remaining"), "0");

  currentTime += 60_000;
  assert.equal(run("second").nextCalled, true);
});

test("sensitive public auth routes mount rate limiting before handlers", async () => {
  const source = await readFile(
    new URL("../routes/auth.ts", import.meta.url),
    "utf8",
  );
  for (const route of [
    "signin",
    "signup",
    "change-password",
    "forgot-password",
    "reset-password",
  ]) {
    const declaration = new RegExp(
      `router\\.post\\(\\"/auth/${route}\\",\\s*[a-zA-Z]+RateLimit`,
    );
    assert.match(source, declaration, route);
  }
  assert.match(source, /signinAccountRateLimit/);
  assert.match(source, /forgotPasswordAccountRateLimit/);
});
