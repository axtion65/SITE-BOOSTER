import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../routes/mockups.ts", import.meta.url), "utf8");

test("Brand Model creation reuses a persisted pending candidate set unless replacement is explicit", () => {
  const createRoute = source.slice(source.indexOf('router.post("/brand-models"'), source.indexOf('router.post("/brand-models/:id/generate"'));
  assert.match(createRoute, /!p\.data\.replacePendingCandidateSet&&pending\[0\]/);
  assert.match(createRoute, /replacementIds=p\.data\.replacePendingCandidateSet\?pending\.map/);
  assert.doesNotMatch(createRoute, /SET active=FALSE/);
});

test("failed replacement generation preserves existing pending candidates", () => {
  const route = source.slice(source.indexOf('router.post("/brand-models/:id/generate"'), source.indexOf('router.post("/brand-models/:id/select"'));
  const provider = route.indexOf("provider.createBrandModel");
  const persist = route.indexOf("UPDATE brand_models SET reference_object_paths");
  const deactivate = route.indexOf("SET active=FALSE");
  assert.ok(provider >= 0 && provider < persist && persist < deactivate);
  const failureCleanup=route.slice(route.lastIndexOf("catch(error){if"));
  assert.match(failureCleanup,/WHERE id=\$1.*jsonb_array_length\(reference_object_paths\)=0/);
  assert.doesNotMatch(failureCleanup,/id=ANY/);
});

test("successful replacement deactivates old pending set only after new candidate paths are persisted", () => {
  const route = source.slice(source.indexOf('router.post("/brand-models/:id/generate"'), source.indexOf('router.post("/brand-models/:id/select"'));
  assert.ok(route.indexOf("UPDATE brand_models SET reference_object_paths") < route.indexOf("UPDATE brand_models SET active=FALSE"));
  assert.ok(route.indexOf("UPDATE brand_models SET active=FALSE") < route.indexOf('client.query("COMMIT")'));
  assert.match(route,/id=ANY\(\$2::text\[\]\).*id<>\$3/);
});

test("existing candidates return before construction or invocation of the image provider", () => {
  const route = source.slice(source.indexOf('router.post("/brand-models/:id/generate"'), source.indexOf('router.post("/brand-models/:id/select"'));
  const existingReturn = route.indexOf("model.reference_object_paths?.length");
  assert.ok(existingReturn >= 0);
  assert.ok(existingReturn < route.indexOf("new FalMockupImageProvider"));
  assert.ok(existingReturn < route.indexOf("provider.createBrandModel"));
});
