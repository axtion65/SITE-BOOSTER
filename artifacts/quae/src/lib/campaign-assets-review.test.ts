import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Review Completed Assets focuses the completed campaign assets section", async () => {
  const page = await readFile(
    new URL("../pages/studio/campaign-detail.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /data\.nextAction === "review_assets"/);
  assert.match(page, /\? openAssetsReview/);
  assert.match(page, /id="campaign-assets"[\s\S]*?tabIndex=\{-1\}/);
  assert.match(page, /Completed Campaign Assets/);
  assert.match(page, /Previous version · not current/);
  assert.match(page, /v\.is_current && v\.video_url/);
  assert.match(page, /Prepare Current Video/);
  assert.match(page, /scrollIntoView/);
  assert.match(page, /section\?\.focus/);
  assert.doesNotMatch(page, /: "#campaign-work"/);
});
