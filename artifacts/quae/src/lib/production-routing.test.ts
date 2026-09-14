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

test("every production page carries the browser security header baseline", () => {
  assert.deepEqual(vercel.headers[0], {
    source: "/(.*)",
    headers: [
      {
        key: "Content-Security-Policy",
        value: "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; frame-src 'none'; form-action 'self' https://checkout.stripe.com https://billing.stripe.com; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https:; worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests",
      },
      { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=31536000" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    ],
  });

  const contentSecurityPolicy = vercel.headers[0].headers[0].value;
  for (const directive of [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "frame-src 'none'",
    "upgrade-insecure-requests",
  ]) {
    assert.match(contentSecurityPolicy, new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
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
