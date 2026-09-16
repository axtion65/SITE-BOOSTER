import assert from "node:assert/strict";
import test from "node:test";
import { shouldPollCampaignWorkspace } from "./campaign-workspace-polling";

test("campaign workspace polls only while the latest run is active", () => {
  assert.equal(shouldPollCampaignWorkspace("queued"), true);
  assert.equal(shouldPollCampaignWorkspace("running"), true);

  for (const status of [
    undefined,
    null,
    "ready_for_review",
    "approved",
    "failed",
    "cancelled",
  ]) {
    assert.equal(shouldPollCampaignWorkspace(status), false, String(status));
  }
});
