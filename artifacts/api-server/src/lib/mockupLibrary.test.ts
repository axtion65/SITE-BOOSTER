import assert from "node:assert/strict";
import test from "node:test";
import { CUSTOMER_MOCKUP_LIBRARY_QUERY, CUSTOMER_MOCKUP_PROJECT_QUERY, MOCKUP_VERSIONS_QUERY } from "./mockupLibrary.js";

test("customer library scopes projects to the authenticated owner",()=>{
  assert.match(CUSTOMER_MOCKUP_LIBRARY_QUERY,/WHERE mp\.user_id = \$1/);
  assert.match(CUSTOMER_MOCKUP_PROJECT_QUERY,/mp\.id = \$1 AND mp\.user_id = \$2/);
});

test("reopened campaign visual carries its authoritative approved run",()=>{
  assert.match(CUSTOMER_MOCKUP_PROJECT_QUERY,/c\.approved_run_id/);
});

test("library includes every saved version newest first",()=>{
  assert.match(CUSTOMER_MOCKUP_LIBRARY_QUERY,/LEFT JOIN mockup_versions/);
  assert.match(CUSTOMER_MOCKUP_LIBRARY_QUERY,/json_agg\(mv ORDER BY mv\.version_number DESC\)/);
  assert.match(MOCKUP_VERSIONS_QUERY,/ORDER BY version_number DESC/);
});
