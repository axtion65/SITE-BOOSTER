import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../lib/db/migrations/0001_marketing_context.sql",
  import.meta.url,
);

test("marketing startup migration is complete and restart-safe", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  for (const table of ["businesses", "brand_kits", "products", "product_images"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, "i"));
  }

  assert.match(sql, /REFERENCES users\(id\) ON DELETE CASCADE/i);
  assert.match(sql, /REFERENCES businesses\(id\) ON DELETE CASCADE/i);
  assert.match(sql, /REFERENCES products\(id\) ON DELETE CASCADE/i);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS businesses_user_id_unique/i);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS brand_kits_business_id_unique/i);
  assert.match(sql, /CONSTRAINT products_type_check CHECK/i);
  assert.match(sql, /CONSTRAINT product_images_role_check CHECK/i);
  assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN)/i);
});
