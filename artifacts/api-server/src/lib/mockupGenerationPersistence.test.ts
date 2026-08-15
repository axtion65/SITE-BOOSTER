import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const routeUrl = new URL("../routes/mockups.ts", import.meta.url);

test("generation persists a version only from the locked owned project", async () => {
  const source = await readFile(routeUrl, "utf8");

  assert.match(
    source,
    /SELECT id FROM mockup_projects WHERE id=\$1 AND user_id=\$2 FOR UPDATE/,
  );
  assert.match(
    source,
    /INSERT INTO mockup_versions[\s\S]*SELECT \$1,mp\.id[\s\S]*FROM mockup_projects mp WHERE mp\.id=\$2 AND mp\.user_id=\$9 RETURNING \*/,
  );
  assert.match(source, /mockup_project_missing_during_generation/);
  assert.match(source, /mockup_version_persistence_failed/);
});

test("provider construction stays after successful version persistence", async () => {
  const source = await readFile(routeUrl, "utf8");
  const persistence = source.indexOf("INSERT INTO mockup_versions");
  const commit = source.indexOf('await client.query("COMMIT")', persistence);
  const provider = source.indexOf("new FalMockupImageProvider", persistence);

  assert.ok(persistence >= 0);
  assert.ok(commit > persistence);
  assert.ok(provider > commit);
});
