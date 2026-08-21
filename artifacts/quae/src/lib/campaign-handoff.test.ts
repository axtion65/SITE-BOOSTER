import assert from "node:assert/strict";
import test from "node:test";
import {
  approvedCampaignToStudio,
  preparedVideoBriefToStudio,
  shouldRestoreStudioDraft,
} from "./campaign-handoff";

const approvedCampaign = {
  id: "campaign-1",
  name: "Big Al T-Shirt Campaign",
  status: "approved",
  approved_run_id: "run-2",
  brief: { channel: "TikTok", duration: "30 seconds" },
  runs: [
    { id: "run-1", status: "needs_revision", final_result: {} },
    {
      id: "run-2",
      status: "ready_for_review",
      context_snapshot: {
        campaignBrief: {
          channel: "Instagram Reels",
          duration: "30 seconds",
          objective: "Sell the summer drop",
        },
        product: {
          name: "Big Al T-Shirt",
          description: "A heavyweight cotton tee.",
          benefits: ["Soft", "Durable"],
          targetAudience: "Streetwear fans",
          cta: "Shop the drop",
        },
        business: { name: "Big Al", description: "Independent apparel." },
      },
      final_result: {
        strategy: { audience: "Fashion buyers" },
        finalScript: {
          hook: "Meet your new favorite tee.",
          script:
            "Meet your new favorite tee. Heavyweight comfort, made for every day. Shop the drop.",
          callToAction: "Shop the drop",
        },
        factcheck: { pass: true },
        qa: { pass: true },
      },
    },
  ],
};

test("approved campaign handoff populates Creative from the authoritative approved run", () => {
  const handoff = approvedCampaignToStudio(approvedCampaign);
  assert.ok(handoff);
  assert.equal(handoff.productName, "Big Al T-Shirt");
  assert.match(handoff.description, /heavyweight cotton tee/i);
  assert.match(handoff.description, /Soft, Durable/);
  assert.equal(handoff.targetAudience, "Streetwear fans");
  assert.equal(handoff.platform, "instagram");
  assert.equal(handoff.duration, "30s");
  assert.equal(handoff.approvedCta, "Shop the drop");
  assert.equal(
    handoff.expandedScript.script,
    approvedCampaign.runs[1].final_result.finalScript.script,
  );
  assert.equal(
    handoff.expandedScript.voiceoverText,
    approvedCampaign.runs[1].final_result.finalScript.script,
  );
  assert.equal(handoff.expandedScript.callToAction, "Shop the drop");
  assert.ok(
    handoff.expandedScript.scenes.every(
      (scene) => !scene.visualDirection.includes("Shop"),
    ),
  );
});

test("campaign handoff takes precedence over an unrelated saved draft", () => {
  assert.equal(shouldRestoreStudioDraft("?campaignId=campaign-1"), false);
});

test("unapproved and invalid campaign payloads are rejected", () => {
  for (const status of [
    "draft",
    "needs_revision",
    "queued",
    "running",
    "failed",
    "stale",
  ]) {
    assert.equal(
      approvedCampaignToStudio({ ...approvedCampaign, status }),
      null,
    );
  }
  assert.equal(
    approvedCampaignToStudio({
      ...approvedCampaign,
      approved_run_id: "foreign-run",
    }),
    null,
  );
  assert.equal(
    approvedCampaignToStudio({ ...approvedCampaign, runs: [] }),
    null,
  );
  assert.equal(
    approvedCampaignToStudio({
      ...approvedCampaign,
      runs: [
        {
          ...approvedCampaign.runs[1],
          final_result: {
            ...approvedCampaign.runs[1].final_result,
            qa: { pass: false },
          },
        },
      ],
    }),
    null,
  );
});

test("standalone Creative restores drafts while template flow starts clean", () => {
  assert.equal(shouldRestoreStudioDraft(""), true);
  assert.equal(shouldRestoreStudioDraft("?unrelated=value"), true);
  assert.equal(shouldRestoreStudioDraft("?templateId=ugc-1"), false);
  assert.equal(
    shouldRestoreStudioDraft("?templateName=Product%20Demo&platform=tiktok"),
    false,
  );
});


test("prepared video handoff requires the exact brief, approved run, and selected visual", () => {
  const prepared = {id:"brief-1",campaign_id:"campaign-1",campaign_run_id:"run-2",mockup_project_id:"project-1",mockup_version_id:"version-1",render_intent:"animate",brief:{campaignId:"campaign-1",approvedCampaignRunId:"run-2",selectedVisualProjectId:"project-1",selectedVisualVersionId:"version-1",campaignName:"Summer launch",productName:"Big Al T-Shirt",productDescription:"A heavyweight cotton tee.",approvedCopy:"Meet your new favorite tee. Shop the drop.",hook:"Meet your new favorite tee.",targetAudience:"Streetwear fans",offer:"Summer drop",cta:"Shop the drop",platform:"Instagram Reels",duration:"30 seconds",renderIntent:"animate"}};
  const expected = {briefId:"brief-1",campaignId:"campaign-1",approvedRunId:"run-2",selectedVisualProjectId:"project-1",selectedVisualVersionId:"version-1"};
  const handoff = preparedVideoBriefToStudio(prepared, expected);
  assert.ok(handoff);
  assert.equal(handoff.productName, "Big Al T-Shirt");
  assert.equal(handoff.platform, "instagram");
  assert.equal(handoff.duration, "30s");
  assert.equal(handoff.expandedScript.voiceoverText, prepared.brief.approvedCopy);
  assert.equal(preparedVideoBriefToStudio({...prepared,mockup_version_id:"version-stale"},expected),null);
  assert.equal(preparedVideoBriefToStudio({...prepared,campaign_run_id:"run-stale"},expected),null);
});
