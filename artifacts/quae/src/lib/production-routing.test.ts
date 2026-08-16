import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { MARKETING_API_PREFIX, marketingApiPath } from "./marketing-api";

const root = new URL("../../../../", import.meta.url);
const vercel = JSON.parse(await readFile(new URL("vercel.json", root), "utf8"));

test("production sends every API route to the current Railway service before the SPA fallback", () => {
  assert.deepEqual(vercel.rewrites[0], {
    source: "/api/:path*",
    destination: "https://site-booster-production.up.railway.app/api/:path*",
  });
  assert.deepEqual(vercel.rewrites[1], { source: "/(.*)", destination: "/index.html" });
  assert.equal(vercel.rewrites.length, 2);
  // An external rewrite is a transparent proxy; unlike a redirect, it forwards
  // the original method, body, and Authorization header to Railway.
  assert.equal(vercel.redirects, undefined);
});

test("the production build publishes Quae's Vite artifact", () => {
  assert.equal(vercel.buildCommand, "pnpm --filter @workspace/quae run build && node scripts/verify-production-routing.mjs --artifact");
  assert.equal(vercel.outputDirectory, "artifacts/quae/dist/public");
});

test("marketingApi uses one same-origin /api prefix", () => {
  assert.equal(MARKETING_API_PREFIX, "/api");
  assert.equal(marketingApiPath("/mockups/project-id/generate"), "/api/mockups/project-id/generate");
  assert.throws(() => marketingApiPath("/api/mockups/project-id/generate"), /relative API path/);
});

test("production routing contains no obsolete Replit destination", async () => {
  const source = await readFile(new URL("vercel.json", root), "utf8");
  assert.doesNotMatch(source, /replit\.(?:app|dev)/i);
});
