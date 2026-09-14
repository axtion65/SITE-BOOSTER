import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Request, Response } from "express";
import {
  createProviderActionRateLimit,
  ProviderActionBudget,
} from "./providerActionBudget";

test("provider actions have independent account and global hourly ceilings", () => {
  const budget = new ProviderActionBudget(2, 3, 60_000);

  assert.equal(budget.consume("first", 1_000).allowed, true);
  assert.equal(budget.consume("first", 2_000).allowed, true);
  assert.deepEqual(budget.consume("first", 3_000), {
    allowed: false,
    limit: 2,
    remaining: 0,
    retryAfterSeconds: 58,
    scope: "account",
  });
  assert.equal(budget.consume("second", 4_000).allowed, true);
  assert.equal(budget.consume("second", 5_000).scope, "global");
  assert.equal(budget.consume("first", 61_000).allowed, true);
});

test("provider middleware authenticates before consuming budget and returns retry guidance", async () => {
  const budget = new ProviderActionBudget(1, 2, 60_000);
  let now = 1_000;
  const middleware = createProviderActionRateLimit(
    async (authorization) => authorization === "Bearer valid" ? "customer" : null,
    budget,
    () => now,
  );

  const run = async (authorization?: string) => {
    const headers = new Map<string, string>();
    let body: unknown;
    let statusCode = 200;
    let nextCalled = false;
    const req = { headers: { authorization } } as Request;
    const res = {
      locals: {},
      setHeader(name: string, value: string) { headers.set(name, value); },
      status(code: number) { statusCode = code; return this; },
      json(value: unknown) { body = value; return this; },
    } as unknown as Response;
    await middleware(req, res, () => { nextCalled = true; });
    return { body, headers, locals: res.locals, nextCalled, statusCode };
  };

  assert.equal((await run()).statusCode, 401);
  const accepted = await run("Bearer valid");
  assert.equal(accepted.nextCalled, true);
  assert.equal(accepted.locals.providerActionUserId, "customer");

  now = 2_000;
  const blocked = await run("Bearer valid");
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers.get("Retry-After"), "59");
});

test("every non-video provider entry point shares the authenticated budget", () => {
  const routes = [
    readFileSync(new URL("../routes/studio.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../routes/campaigns.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../routes/mockups.ts", import.meta.url), "utf8"),
  ].join("\n");
  for (const path of [
    "/studio/expand-prompt",
    "/studio/regenerate-scene",
    "/campaigns/:id/rebuild",
    "/campaigns/:id/run-team",
    "/campaigns/:id/request-changes",
    "/brand-models/:id/generate",
    "/mockups/:id/generate",
  ]) {
    assert.match(routes, new RegExp(`router\\.use\\("${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}", providerActionRateLimit\\)`), path);
  }
});
