import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../../../../", import.meta.url);

test("project detail explains measured duration and requires explicit paid confirmation", async () => {
  const source = await readFile(
    new URL("artifacts/quae/src/pages/studio/project-detail.tsx", root),
    "utf8",
  );
  assert.match(source, /qualityStatus === "duration_upgrade_required"/);
  assert.match(source, /your earlier charge was refunded/i);
  assert.match(source, /no visual scene was submitted/i);
  assert.match(source, /confirmDurationUpgrade: true/);
  assert.match(source, /getProductionCreditCost\(modelKey/);
});
