import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildFalSceneRequest } from "./falvideo";

const root = new URL("../../../../", import.meta.url);

test("scene payloads use current full-ad providers and exact scene duration", () => {
  const ltx = buildFalSceneRequest({ prompt: "Approved product benefit", durationSeconds: 6.8, renderingModelId: "ltx-fast", platform: "instagram" });
  assert.equal(ltx.modelPath, "fal-ai/ltx-2.3/text-to-video/fast");
  assert.equal(ltx.input.aspect_ratio, "9:16");
  assert.equal(ltx.input.duration, "8");
  assert.equal(ltx.input.resolution, "1080p");
  assert.equal(ltx.input.fps, "25");
  assert.equal(ltx.input.generate_audio, false);
  assert.equal(ltx.input.num_frames, undefined);
  const kling = buildFalSceneRequest({ prompt: "Approved premium benefit", durationSeconds: 7, renderingModelId: "kling", platform: "youtube" });
  assert.equal(kling.modelPath, "fal-ai/kling-video/v3/standard/text-to-video");
  assert.equal(kling.input.duration, "7");
  assert.equal(kling.input.generate_audio, false);

  const klingImage = buildFalSceneRequest({
    prompt: "Approved product in use",
    durationSeconds: 4.2,
    renderingModelId: "kling",
    platform: "instagram",
    providerImageUrl: "https://example.com/product.png",
  });
  assert.equal(klingImage.modelPath, "fal-ai/kling-video/v3/standard/image-to-video");
  assert.equal(klingImage.input.duration, "5");
  assert.equal(klingImage.input.start_image_url, "https://example.com/product.png");
  assert.equal(klingImage.input.image_url, undefined);
  assert.equal(klingImage.input.aspect_ratio, undefined);
});

test("project creation starts the persisted production worker, not a one-shot provider render", async () => {
  const source = await readFile(new URL("artifacts/api-server/src/routes/projects.ts", root), "utf8");
  const createRoute = source.slice(source.indexOf('router.post("/projects"'), source.indexOf('router.get("/projects/:id"'));
  assert.match(createRoute, /productionVersion:\s*VIDEO_PRODUCTION_VERSION/);
  assert.match(createRoute, /status:\s*"preparing"/);
  assert.match(createRoute, /startVideoProduction\(project\.id\)/);
  assert.doesNotMatch(createRoute, /submitFalVideoRender/);
});

test("signed provider callbacks resolve persisted scene ids before legacy jobs", async () => {
  const source = await readFile(new URL("artifacts/api-server/src/routes/webhooks.ts", root), "utf8");
  assert.ok(source.indexOf("processProductionSceneCompletion") < source.indexOf("allProcessing"));
  assert.match(source, /requestId,\s*status:\s*payload\.status,\s*videoUrl/s);
});

test("the worker has a bounded provider-free fallback and prevents duplicate archival", async () => {
  const source = await readFile(new URL("artifacts/api-server/src/lib/videoProduction.ts", root), "utf8");
  assert.match(source, /MAX_SCENE_POLLS = 2/);
  assert.match(source, /eq\(videoRenderScenesTable\.pollCount, scene\.pollCount\)/);
  assert.match(source, /pollFalVideoRender\(scene\.providerToken\)/);
  assert.match(source, /status:\s*"archiving"/);
  assert.match(source, /scene_submission_indeterminate/);
});

test("assembly includes voiceover, ordered scenes, deterministic captions, and end card", async () => {
  const source = await readFile(new URL("artifacts/api-server/src/lib/videoAssembler.ts", root), "utf8");
  assert.match(source, /buildAdvertSubtitles/);
  assert.match(source, /concat=n=/);
  assert.match(source, /subtitles=filename=/);
  assert.match(source, /audioInput.*a:0/s);
  assert.match(source, /endCard/);
});

test("production retries only the failed scene once", async () => {
  const source = await readFile(new URL("artifacts/api-server/src/lib/videoProduction.ts", root), "utf8");
  assert.match(source, /scene\.retryCount < 1/);
  assert.match(source, /retryCount:\s*1/);
  assert.match(source, /submitScene\(retry\.id\)/);
  assert.match(source, /provider_scene_failed_twice/);
});

test("create-new scene production never injects unrelated stored images", async () => {
  const source = await readFile(new URL("artifacts/api-server/src/lib/videoProduction.ts", root), "utf8");
  const context = source.slice(
    source.indexOf("async function productionContext"),
    source.indexOf("async function preparePlan"),
  );
  assert.match(context, /project\.renderIntent === "animate"\s*\?\s*\[project\.sourceAssetId\]\.filter/s);
  assert.match(context, /:\s*\[\];/);
  assert.doesNotMatch(context, /product_images|mockup_versions|Array\.from\(new Set\(owned\)\)/);
});
