import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { approvedCampaignBriefToExpandedScript, approvedCampaignPlatform, READABLE_CAPTION_STYLE } from "./videoRenderBrief";

test("campaign production is bound to the approved brief, run, owner, business and exact visual", async () => {
  const source = await readFile(new URL("../routes/projects.ts", import.meta.url), "utf8");
  assert.match(source, /c\.approved_run_id=vb\.campaign_run_id/);
  assert.match(source, /b\.user_id=vb\.customer_id/);
  assert.match(source, /s\.mockup_version_id=vb\.mockup_version_id/);
  assert.match(source, /JOIN mockup_versions mv ON mv\.id=vb\.mockup_version_id AND mv\.mockup_project_id=mp\.id\s+AND mv\.object_path IS NOT NULL/);
  assert.doesNotMatch(source, /mv\.status/);
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
    productName: "Quae",
    productDescription: "Approved campaigns and product visuals for small businesses.",
    targetAudience: "small business owners",
  });
  assert.equal(approved.script, "Meet Quae. Build a campaign in minutes.");
  assert.equal(approved.voiceoverText, approved.script);
  assert.equal(approved.callToAction, "Build your campaign.");
  assert.equal(approved.estimatedDuration, "30s");
  assert.equal(approvedCampaignPlatform("Instagram Reels"), "instagram");
  assert.ok(approved.scenes.length >= 1);
  assert.match(approved.scenes[0]!.visualDirection, /Director beat — Hook/);
  assert.match(approved.scenes[0]!.visualDirection, /small business owners/);
});

test("approved campaign scenes preserve dotted brand and domain tokens", () => {
  const approvedCopy = "Small business, big marketing goals? Quae.ai creates your campaigns, product visuals, social content, and video ads in one place. Start building your campaign today.";
  const approved = approvedCampaignBriefToExpandedScript({
    approvedCopy,
    hook: "Small business, big marketing goals?",
    cta: "Start building your campaign today.",
    duration: "15 seconds",
    platform: "Instagram",
    productName: "Quae.ai",
    productDescription: "AI marketing campaigns, product visuals, social content, and video ads.",
    targetAudience: "small businesses",
  });

  assert.equal(approved.scenes.length, 3);
  assert.equal(approved.scenes[1]?.description, "Quae.ai creates your campaigns, product visuals, social content, and video ads in one place.");
  assert.equal(approved.scenes.map((scene) => scene.description).join(" "), approvedCopy);
  assert.ok(approved.scenes.every((scene) => scene.description !== "Quae."));
  assert.equal(new Set(approved.scenes.map((scene) => scene.visualDirection)).size, 3);
  assert.match(approved.scenes[1]!.visualDirection, /Director beat — Demonstration/);
  assert.match(approved.scenes[1]!.visualDirection, /AI marketing campaigns/);
  assert.match(approved.scenes[2]!.visualDirection, /Director beat — Payoff/);
  assert.ok(approved.scenes.every((scene) => !scene.visualDirection.includes("Create product-focused visuals")));
});

test("the server keeps approved copy authoritative while directing scenes itself", async () => {
  const source = await readFile(new URL("../routes/projects.ts", import.meta.url), "utf8");
  const matcher = source.slice(source.indexOf("function matchesApprovedCampaignScript"), source.indexOf("const router = Router"));
  assert.match(matcher, /candidate\.voiceoverText === approved\.voiceoverText/);
  assert.doesNotMatch(matcher, /candidate\.scenes/);
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
