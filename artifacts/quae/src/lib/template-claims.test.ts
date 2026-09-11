import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const forbiddenClaims = [
  "3x better",
  "most shared",
  "designed to go viral",
  "7-figure brands",
  "that converts",
  "algorithm-optimized",
  "Trust at scale",
  "store conversion",
  "watch time = trust = sales",
] as const;

test("video template marketing copy avoids unsupported performance claims", () => {
  const catalog = readFileSync(
    new URL("../../../../lib/templates/src/index.ts", import.meta.url),
    "utf8",
  );
  const page = readFileSync(new URL("../pages/templates.tsx", import.meta.url), "utf8");
  const combined = `${catalog}\n${page}`.toLowerCase();

  for (const claim of forbiddenClaims) {
    assert.equal(combined.includes(claim.toLowerCase()), false, `unsupported claim remains: ${claim}`);
  }

  assert.match(catalog, /Use only testimonials you have permission to publish/);
  assert.match(page, /12 reusable video structures for common marketing goals/);
});
