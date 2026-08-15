import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../routes/mockups.ts", import.meta.url), "utf8");

test("Brand Model creation reuses a persisted pending candidate set unless replacement is explicit", () => {
  const createRoute = source.slice(source.indexOf('router.post("/brand-models"'), source.indexOf('router.post("/brand-models/:id/generate"'));
  assert.match(createRoute, /!p\.data\.replacePendingCandidateSet.*jsonb_array_length\(reference_object_paths\)>1/);
  assert.match(createRoute, /if\(pending\)return res\.status\(200\)\.json\(pending\)/);
  assert.match(createRoute, /if\(p\.data\.replacePendingCandidateSet\).*active=FALSE/);
});

test("existing candidates return before construction or invocation of the image provider", () => {
  const route = source.slice(source.indexOf('router.post("/brand-models/:id/generate"'), source.indexOf('router.post("/brand-models/:id/select"'));
  const existingReturn = route.indexOf("model.reference_object_paths?.length");
  assert.ok(existingReturn >= 0);
  assert.ok(existingReturn < route.indexOf("new FalMockupImageProvider"));
  assert.ok(existingReturn < route.indexOf("provider.createBrandModel"));
});
