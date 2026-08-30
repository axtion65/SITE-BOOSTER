import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Review and Fix Campaign controls focus the safe review section", async () => {
  const page = await readFile(
    new URL("../pages/studio/campaign-detail.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /Fix Campaign/);
  assert.match(page, /Review Campaign/);
  assert.match(page, /id="campaign-review"[\s\S]*?tabIndex=\{-1\}/);
  assert.match(page, /scrollIntoView/);
  assert.match(page, /\.focus\(/);
  assert.match(page, /Rebuild from Quae\.ai information/);
});

test("failed quality review explains the issue and repairs the saved draft", async () => {
  const page = await readFile(
    new URL("../pages/studio/campaign-detail.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /What needs to change/);
  assert.match(page, /qualityFeedback\.join/);
  assert.match(page, /REPAIR SAVED DRAFT/);
  assert.doesNotMatch(
    page.slice(
      page.indexOf('{run?.status === "needs_revision"'),
      page.indexOf("{result &&"),
    ),
    /disabled=\{!notes\.trim\(\)/,
  );
});
