import assert from "node:assert/strict";
import test from "node:test";
import { buildFalQueueToken, buildFalRenderRequest, buildFalWebhookUrl, buildVideoPrompt, extractFalRequestId, isFalToken, isWebhookFalToken, parseFalQueueToken, pollFalVideoRender, sanitizeVisualPrompt, type ExpandedScript } from "./falvideo";
import { compileVideoRenderBrief } from "./videoRenderBrief";

const apparel: ExpandedScript = {
  script: "Big Al's makes custom printed T-shirts for local teams.", hook: "Wear your idea.",
  callToAction: "Get Big Al's custom shirts for $10 today.",
  voiceoverText: "Big Al's custom printed T-shirts are ten dollars. Order yours today.",
  scenes: [
    { sceneNumber: 1, description: "A woman reveals a custom printed T-shirt", duration: "5s", visualDirection: "The shirt front faces camera beside a SALE sign" },
    { sceneNumber: 2, description: "Friends celebrate", duration: "5s", visualDirection: "A poster says BUY NOW" },
  ], suggestedMusic: "subtle upbeat instrumental", estimatedDuration: "30s",
};

const risks = [
  ["Show https://quae.ai on a browser page", /https|browser page/i],
  ["Display the $23 price", /\$23|price/i],
  ["Add a caption reading \"Buy now\"", /caption|buy now/i],
  ["Show five-star reviews", /star review/i],
  ["A countdown timer showing 10", /countdown/i],
  ["Founder studies a computer dashboard", /dashboard/i],
  ["Close-up of the phone UI", /phone ui/i],
  ["Customer reads a sign saying \"SALE\"", /\bsign\b|sale/i],
  ["Macro shot of the packaging label", /packaging label/i],
] as const;
for (const [input, forbidden] of risks) {
  test(`rewrites text-prone prompt: ${input}`, () => assert.doesNotMatch(sanitizeVisualPrompt(input), forbidden));
}

test("safe cinematic prompt remains unchanged", () => {
  const safe = "Slow dolly toward a delighted customer using the matte ceramic product in warm window light.";
  assert.equal(sanitizeVisualPrompt(safe), safe);
});

test("short apparel prompt is one product-hero concept with comprehensive text safety", () => {
  const approvedBefore = JSON.stringify(apparel);
  const brief = compileVideoRenderBrief(apparel, "30s", "ltx-fast");
  const prompt = buildVideoPrompt(apparel, "instagram", "5s", undefined, brief);
  assert.equal(brief.visualBeats.length, 1);
  assert.match(brief.visualProductionBrief, /product is the hero and focal subject/i);
  assert.match(brief.visualProductionBrief, /clear front view|garment surface/i);
  assert.match(prompt, /one continuous product-focused shot/i);
  assert.match(prompt, /no signs, posters, billboards, menus/i);
  assert.match(prompt, /fake lettering.*background writing/i);
  assert.doesNotMatch(prompt, /\$10|ten dollars|order yours|buy now/i);
  assert.doesNotMatch(prompt, /create (?:an? )?logo|invent (?:an? )?logo/i);
  assert.equal(JSON.stringify(apparel), approvedBefore);
});

test("provider request prefers supported image conditioning without making provider calls", () => {
  const request = buildFalRenderRequest(apparel, "instagram", "30s", "kling", undefined, "animate", "https://signed.example/product.jpg");
  assert.match(request.modelPath, /image-to-video/);
  assert.equal(request.input.image_url, "https://signed.example/product.jpg");
});

test("no image falls back and unsupported models safely ignore images", () => {
  const noImage = buildFalRenderRequest(apparel, "instagram", "30s", "ltx-fast");
  assert.match(noImage.modelPath, /text-to-video/);
  assert.equal(noImage.input.image_url, undefined);
  assert.throws(() => buildFalRenderRequest(apparel, "instagram", "30s", "ovi", undefined, "animate", "https://signed.example/product.jpg"));
});

test("submission token preserves fal's exact versioned Wan queue URLs", () => {
  const statusUrl = "https://queue.fal.run/fal-ai/wan/v2.2/text-to-video/requests/wan-request/status";
  const responseUrl = "https://queue.fal.run/fal-ai/wan/v2.2/text-to-video/requests/wan-request/response";
  const token = buildFalQueueToken({ modelPath: "fal-ai/wan/v2.2/text-to-video", requestId: "wan-request", statusUrl, responseUrl });
  assert.equal(token, `fal2:wan-request|||${statusUrl}|||${responseUrl}`);
  assert.deepEqual(parseFalQueueToken(token), {
    modelPath: "fal-ai/wan/v2.2/text-to-video",
    requestId: "wan-request",
    statusUrl,
    responseUrl,
  });
  assert.equal(isFalToken(token), true);
  assert.equal(extractFalRequestId(token), "wan-request");
});

test("webhook renders use a distinct token and never depend on a response endpoint", () => {
  const statusUrl = "https://queue.fal.run/fal-ai/wan/v2.2/text-to-video/requests/wan-webhook/status";
  const token = buildFalQueueToken({
    modelPath: "fal-ai/wan/v2.2/text-to-video",
    requestId: "wan-webhook",
    statusUrl,
    responseUrl: "https://queue.fal.run/broken/response",
    webhookRegistered: true,
  });
  assert.equal(token, `fal3:wan-webhook|||${statusUrl}`);
  assert.equal(isWebhookFalToken(token), true);
  assert.deepEqual(parseFalQueueToken(token), {
    modelPath: "fal-ai/wan/v2.2/text-to-video",
    requestId: "wan-webhook",
    statusUrl,
    webhookRegistered: true,
  });
});

test("production webhook targets Railway's API directly without a redirect", () => {
  assert.equal(buildFalWebhookUrl({
    RAILWAY_PUBLIC_DOMAIN: "site-booster-production.up.railway.app",
    APP_URL: "https://quae.ai",
  }), "https://site-booster-production.up.railway.app/api/webhooks/fal");
});

test("completed legacy Wan jobs canonicalize fal's live response_url to the documented response endpoint", async (t) => {
  const requestUrl = "https://queue.fal.run/fal-ai/wan/v2.2/text-to-video/requests/01a05b73-62c5-7a32-a77d-15d0dc02791a";
  const responseUrl = `${requestUrl}/response`;
  const fetchMock = t.mock.fn(async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), responseUrl);
    assert.equal((init?.headers as Record<string, string>).Authorization, "Key test-key");
    return new Response(JSON.stringify({ video: { url: "https://cdn.example/video.mp4" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  assert.deepEqual(
    await pollFalVideoRender(
      "fal:fal-ai/wan/v2.2/text-to-video:01a05b73-62c5-7a32-a77d-15d0dc02791a",
      {
        credentials: "test-key",
        status: async () => ({ status: "COMPLETED", response_url: requestUrl }),
        result: async () => { throw new Error("queue.result must not reconstruct a versioned Wan endpoint"); },
        fetch: fetchMock,
      },
    ),
    { status: "done", url: "https://cdn.example/video.mp4" },
  );
  assert.equal((fetchMock as any).mock.callCount(), 1);
});

test("completed jobs stop polling after a permanent result-fetch failure", async (t) => {
  const responseUrl = "https://queue.fal.run/fal-ai/wan/v2.2/text-to-video/requests/gone/response";
  assert.deepEqual(await pollFalVideoRender("fal:fal-ai/wan/v2.2/text-to-video:gone", {
    credentials: "test-key",
    status: async () => ({ status: "COMPLETED", response_url: responseUrl }),
    fetch: t.mock.fn(async () => new Response("not found", { status: 404 })) as typeof fetch,
  }), { status: "failed" });
});
