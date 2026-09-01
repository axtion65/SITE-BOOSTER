import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("legacy marketing object recovery requires exclusive persisted ownership", async () => {
  const source = await readFile(new URL("../routes/storage.ts", import.meta.url), "utf8");
  const query = source.slice(
    source.indexOf("export const persistedMarketingObjectOwnersQuery"),
    source.indexOf("async function isExclusivelyOwnedPersistedMarketingObject"),
  );
  assert.match(query, /BOOL_AND\(owner_id = \$1\)/);
  assert.match(query, /mockup_versions[\s\S]*mockup_projects[\s\S]*mv\.object_path = \$2/);
  assert.match(query, /product_images[\s\S]*businesses[\s\S]*pi\.object_path = \$2/);
  assert.match(query, /brand_kits[\s\S]*logo_object_path = \$2/);
  assert.match(query, /brand_models[\s\S]*JSONB_BUILD_ARRAY\(\$2::TEXT\)/);
  assert.match(query, /projects[\s\S]*product_image_url = \$2/);
});

test("signed image route repairs only a denied object with database ownership", async () => {
  const source = await readFile(new URL("../routes/storage.ts", import.meta.url), "utf8");
  const route = source.slice(
    source.indexOf("router.get('/storage/object-signed-url/*path'"),
    source.indexOf("/**\n * GET /storage/objects/*"),
  );
  assert.match(route, /!allowed[\s\S]*isExclusivelyOwnedPersistedMarketingObject\(userId, objectPath\)/);
  assert.match(route, /setObjectAclPolicy\(objectFile,[\s\S]*owner: userId[\s\S]*visibility: 'private'/);
  assert.ok(route.indexOf("if (!allowed)") < route.indexOf("getSignedObjectEntityUrl"));
});
