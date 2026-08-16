import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../routes/health.ts", import.meta.url), "utf8");

test("the public production routing probe returns API JSON", () => {
  assert.match(source, /router\.get\("\/health", health\)/);
  assert.match(source, /res\.json\(data\)/);
});
