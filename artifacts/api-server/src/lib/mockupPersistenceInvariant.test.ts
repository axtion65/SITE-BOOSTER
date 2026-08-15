import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("startup verifies mockup persistence without retaining probe data", async () => {
  const source = await readFile(
    new URL("./mockupPersistenceInvariant.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /to_regclass\('mockup_versions'\)/);
  assert.match(source, /constraint_parent_oid !== metadata\.parent_oid/);
  assert.match(source, /INSERT INTO mockup_versions/);
  assert.match(source, /await client\.query\("ROLLBACK"\)/);
  assert.doesNotMatch(source, /COMMIT/);
  assert.doesNotMatch(source, /FalMockupImageProvider|FAL_KEY|provider/);
});

test("server runs the persistence invariant before accepting traffic", async () => {
  const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");
  const migration = source.indexOf("await runStartupMigrations()");
  const invariant = source.indexOf("await verifyMockupPersistenceBeforeTraffic(pool)");
  const listen = source.indexOf("app.listen");

  assert.ok(migration >= 0);
  assert.ok(invariant > migration);
  assert.ok(listen > invariant);
});
