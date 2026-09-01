import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { approvedCampaignBriefToExpandedScript, approvedCampaignPlatform, READABLE_CAPTION_STYLE } from "./videoRenderBrief";

test("campaign production is bound to the approved brief, run, owner, business and exact visual", async () => {
  const source = await readFile(new URL("../routes/projects.ts", import.meta.url), "utf8");
  assert.match(source, /c\.approved_run_id=vb\.campaign_run_id/);
  assert.match(source, /b\.user_id=vb\.customer_id/);
  assert.match(source, /s\.mockup_version_id=vb\.mockup_version_id/);
  assert.match(source, /parsed\.data\.sourceAssetId !== production\.object_path/);
  assert.match(source, /req\.body\?\.confirmed !== true/);
  assert.match(source, /approvedCampaignBriefToExpandedScript\(production\.brief\)/);
  assert.match(source, /matchesApprovedCampaignScript\(submittedCampaignScript, authoritativeCampaignScript\)/);
  assert.ok(source.indexOf("tx.insert(projectsTable)") < source.indexOf("startVideoProduction(project.id)"));
  const createRoute = source.slice(
    source.indexOf('router.post("/projects"'),
    source.indexOf('router.get("/projects/:id"'),
  );
  assert.doesNotMatch(createRoute, /submitFalVideoRender/);
});

test("approved no-image campaigns use the exact safe run without weakening animation checks",async()=>{const source=await readFile(new URL("../routes/projects.ts",import.meta.url),"utf8");assert.match(source,/parsed\.data\.renderIntent==="animate"/);assert.match(source,/deriveApprovedTextVideoBrief\(authority/);assert.match(source,/campaignVideoBriefId\|\|parsed\.data\.sourceAssetId\|\|parsed\.data\.productImageUrl/);assert.match(source,/production=\{campaign_run_id:authority\.campaign_run_id,brief:approvedBrief\}/);});

test("campaign render retries are durable and idempotent", async () => {
  const migration = await readFile(new URL("../../../../lib/db/migrations/0017_campaign_video_production.sql", import.meta.url), "utf8");
  assert.match(migration, /UNIQUE INDEX[\s\S]*projects\(user_id,idempotency_key\)/);
  assert.match(migration, /campaign_video_brief_id/);
  const source = await readFile(new URL("../routes/projects.ts", import.meta.url), "utf8");
  assert.match(source, /projects_user_idempotency_unique/);
  assert.match(source, /eq\(projectsTable\.idempotencyKey, idempotencyKey\)/);
});

test("approved campaign brief is the authoritative provider script", () => {
  const approved = approvedCampaignBriefToExpandedScript({
    approvedCopy: "Meet Quae. Build a campaign in minutes.",
    hook: "Your AI marketing department.",
    cta: "Build your campaign.",
    duration: "30 seconds",
    platform: "Instagram",
  });
  assert.equal(approved.script, "Meet Quae. Build a campaign in minutes.");
  assert.equal(approved.voiceoverText, approved.script);
  assert.equal(approved.callToAction, "Build your campaign.");
  assert.equal(approved.estimatedDuration, "30s");
  assert.equal(approvedCampaignPlatform("Instagram Reels"), "instagram");
  assert.ok(approved.scenes.length >= 1);
});

test("images and error documents cannot pass as generated videos", async () => {
  process.env.AWS_ENDPOINT_URL ||= "https://storage.invalid";
  process.env.AWS_ACCESS_KEY_ID ||= "test";
  process.env.AWS_SECRET_ACCESS_KEY ||= "test";
  process.env.AWS_S3_BUCKET_NAME ||= "test";
  const { validateVideoPayload } = await import("./objectStorage");
  assert.throws(() => validateVideoPayload(Buffer.from([137,80,78,71,13,10,26,10]), "image/png"));
  assert.throws(() => validateVideoPayload(Buffer.from('{"error":"provider failed"}'), "application/json"));
  assert.throws(() => validateVideoPayload(Buffer.from("not a video"), "video/mp4"));
});

test("caption styling has contrast, backing, stroke, and safe margins", () => {
  assert.equal(READABLE_CAPTION_STYLE.color, "#FFFFFF");
  assert.match(READABLE_CAPTION_STYLE.backingColor, /0\.7[5-9]/);
  assert.match(READABLE_CAPTION_STYLE.stroke, /#000000/);
  assert.ok(READABLE_CAPTION_STYLE.safeMarginPercent >= 5);
  assert.ok(READABLE_CAPTION_STYLE.maxLineCharacters <= 42);
});
