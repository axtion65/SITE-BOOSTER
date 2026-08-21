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
    "0005_safe_brand_model_replacement.sql",
    "0006_mockup_generation_runtime_guard.sql",
    "0007_repair_mockup_version_project_foreign_key.sql",
    "0008_repair_resolved_mockup_relationship.sql",
    "0009_resumable_mockup_production.sql",
    "0010_mockup_generation_schema_guard.sql",
    "0011_campaign_video_context.sql",
    "0012_website_import_drafts.sql",
    "0013_campaign_context_isolation.sql",
    "0014_render_intent_credit_ledger.sql",
    "0015_campaign_identity_guards.sql",
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

test("mockup generation runtime guard repairs every production column safely", async () => {
  const sql = await readFile(
    new URL("lib/db/migrations/0006_mockup_generation_runtime_guard.sql", root),
    "utf8",
  );
  for (const column of [
    "idempotency_key",
    "creation_path",
    "brand_model_id",
    "product_reference_paths",
    "generation_brief",
    "provider_model",
    "width",
    "height",
    "content_type",
    "failure_code",
  ]) assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`));
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS mockup_versions_idempotency_key_unique/);
  assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN)/i);
});

test("mockup version relationship repair preserves customer data", async () => {
  const sql = await readFile(
    new URL("lib/db/migrations/0007_repair_mockup_version_project_foreign_key.sql", root),
    "utf8",
  );
  assert.match(sql, /REFERENCES mockup_projects\(id\)/);
  assert.match(sql, /ON DELETE CASCADE/);
  assert.match(sql, /orphan_count/);
  assert.match(sql, /administrator review/);
  assert.match(sql, /VALIDATE CONSTRAINT mockup_versions_mockup_project_id_fkey/);
  assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN)/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM|TRUNCATE/i);
});


test("resolved mockup relationship repair targets application relations", async () => {
  const sql = await readFile(
    new URL("lib/db/migrations/0008_repair_resolved_mockup_relationship.sql", root),
    "utf8",
  );
  assert.match(sql, /to_regclass\('mockup_versions'\)/);
  assert.match(sql, /to_regclass\('mockup_projects'\)/);
  assert.match(sql, /REFERENCES %s\(id\) ON DELETE CASCADE NOT VALID/);
  assert.match(sql, /VALIDATE CONSTRAINT mockup_versions_mockup_project_id_fkey/);
  assert.doesNotMatch(sql, /DELETE\s+FROM|TRUNCATE|DROP\s+TABLE/i);
});

test("resumable mockup migration is additive and protects paid jobs", async () => {
  const sql = await readFile(new URL("lib/db/migrations/0009_resumable_mockup_production.sql", root), "utf8");
  for (const column of ["job_stage","queued_at","lease_owner","lease_expires_at","attempt_count","provider_output_url"])
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`));
  assert.match(sql, /mockup_versions_production_queue_idx/);
  assert.doesNotMatch(sql, /DELETE\s+FROM|TRUNCATE|DROP\s+(TABLE|COLUMN)/i);
});


test("generation schema guard bundles every route-required column", async () => {
  const sql = await readFile(new URL("lib/db/migrations/0010_mockup_generation_schema_guard.sql", root), "utf8");
  for (const column of ["creative_direction","idempotency_key","creation_path","brand_model_id","product_reference_paths","job_stage","queued_at","lease_owner","lease_expires_at","attempt_count"]) assert.match(sql,new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`));
  assert.match(sql,/mockup_versions_project_idempotency_unique/);
  assert.doesNotMatch(sql,/DELETE\s+FROM|TRUNCATE|DROP\s+(TABLE|COLUMN)/i);
});
