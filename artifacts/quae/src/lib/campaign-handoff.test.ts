import assert from "node:assert/strict";
import test from "node:test";
import {
  approvedCampaignToStudio,
  campaignVideoIdempotencyKey,
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
  assert.match(handoff.expandedScript.scenes[0]!.visualDirection, /Director beat — Hook/);
  assert.match(handoff.expandedScript.scenes[0]!.visualDirection, /Streetwear fans/);
  assert.match(handoff.expandedScript.scenes[1]!.visualDirection, /Director beat — Demonstration/);
  assert.match(handoff.expandedScript.scenes[1]!.visualDirection, /heavyweight cotton tee/i);
  assert.match(handoff.expandedScript.scenes.at(-1)!.visualDirection, /Director beat — Payoff/);
});

test("Creative storyboard preserves dotted brand and domain tokens", () => {
  const approvedCopy = "Small business, big marketing goals? Quae.ai creates your campaigns, product visuals, social content, and video ads in one place. Start building your campaign today.";
  const campaign = {
    ...approvedCampaign,
    runs: approvedCampaign.runs.map((run) => run.id !== "run-2" ? run : {
      ...run,
      final_result: {
        ...run.final_result,
        finalScript: {
          hook: "Small business, big marketing goals?",
          script: approvedCopy,
          callToAction: "Start building your campaign today.",
        },
      },
    }),
  };

  const handoff = approvedCampaignToStudio(campaign);
  assert.ok(handoff);
  assert.equal(handoff.expandedScript.scenes.length, 3);
  assert.equal(handoff.expandedScript.scenes[1]?.description, "Quae.ai creates your campaigns, product visuals, social content, and video ads in one place.");
  assert.equal(handoff.expandedScript.scenes.map((scene) => scene.description).join(" "), approvedCopy);
  assert.ok(handoff.expandedScript.scenes.every((scene) => scene.description !== "Quae."));
  assert.equal(new Set(handoff.expandedScript.scenes.map((scene) => scene.visualDirection)).size, 3);
  assert.ok(handoff.expandedScript.scenes.every((scene) => !scene.visualDirection.includes("Create product-focused visuals")));
});

test("campaign handoff takes precedence over an unrelated saved draft", () => {
  assert.equal(shouldRestoreStudioDraft("?campaignId=campaign-1"), false);
});

test("campaign video retries reuse one attempt key while a new version receives a different key",()=>{const base={campaignId:"campaign-1",approvedRunId:"run-2",briefId:null,renderIntent:"create_new" as const,modelId:"ltx-fast",duration:"15s",attemptId:"attempt-1"};const key=campaignVideoIdempotencyKey(base);assert.equal(key,campaignVideoIdempotencyKey(base));assert.match(String(key),/run-2:create_new:approved-copy:ltx-fast:15s:attempt-1/);assert.notEqual(key,campaignVideoIdempotencyKey({...base,attemptId:"attempt-2"}));assert.notEqual(key,campaignVideoIdempotencyKey({...base,briefId:"brief-1",renderIntent:"animate"}));assert.equal(campaignVideoIdempotencyKey({...base,campaignId:null}),null);});

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
