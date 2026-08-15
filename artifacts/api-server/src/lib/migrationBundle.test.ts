import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
const root = new URL("../../../../", import.meta.url);
test("all canonical migrations include marketing context and campaigns", async () => {
  const names = (await readdir(new URL("lib/db/migrations/", root))).sort();
  assert.deepEqual(names, [
    "0001_marketing_context.sql",
    "0002_campaign_department.sql",
    "0003_mockup_studio.sql",
    "0004_mockup_image_production.sql",
  ]);
  const build = await readFile(
    new URL("artifacts/api-server/build.mjs", root),
    "utf8",
  );
  assert.match(build, /cp\([\s\S]*lib\/db\/migrations[\s\S]*recursive:\s*true/);
});
test("campaign migration has durable lease and duplicate-run protection", async () => {
  const sql = await readFile(
    new URL("lib/db/migrations/0002_campaign_department.sql", root),
    "utf8",
  );
  for (const table of ["campaigns", "campaign_runs", "agent_runs"])
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(sql, /lease_expires_at/);
  assert.match(sql, /campaign_runs_one_active_idx/);
  assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN)/i);
});
