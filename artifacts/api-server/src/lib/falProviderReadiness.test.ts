import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { checkFalProviderReadiness } from "./falProviderReadiness";

test("provider readiness authenticates the exact model through a free GET", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const result = await checkFalProviderReadiness({
    renderingModelId: "ltx-fast",
    hasImage: false,
    env: { FAL_KEY: "test-key" },
    fetchImpl: async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response(JSON.stringify({
        prices: [{ endpoint_id: "fal-ai/ltx-2.3/text-to-video/fast", unit_price: 0.06 }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.equal(result.ready, true);
  assert.equal(result.code, "ready");
  assert.equal(requestInit?.method, "GET");
  assert.equal(new Headers(requestInit?.headers).get("authorization"), "Key test-key");
  assert.match(requestUrl, /models\/pricing/);
  assert.match(requestUrl, /fal-ai%2Fltx-2\.3%2Ftext-to-video%2Ffast/);
});

test("provider readiness fails closed before any request when the key is absent", async () => {
  let called = false;
  const result = await checkFalProviderReadiness({
    renderingModelId: "ltx-fast",
    hasImage: false,
    env: {},
    fetchImpl: async () => { called = true; throw new Error("unexpected request"); },
  });
  assert.equal(result.code, "not_configured");
  assert.equal(called, false);
});

test("provider readiness preserves actionable authorization failures", async () => {
  for (const [status, code] of [[401, "credentials_invalid"], [403, "access_denied"], [429, "rate_limited"]] as const) {
    const result = await checkFalProviderReadiness({
      renderingModelId: "kling",
      hasImage: true,
      env: { FAL_KEY: "test-key" },
      fetchImpl: async () => new Response("{}", { status }),
    });
    assert.equal(result.ready, false);
    assert.equal(result.code, code);
    assert.equal(result.endpointId, "fal-ai/kling-video/v3/standard/image-to-video");
    assert.equal(result.httpStatus, status);
  }
});

test("project creation and rerender gate provider work before charging or TTS", async () => {
  const source = await readFile(new URL("../routes/projects.ts", import.meta.url), "utf8");
  const createRoute = source.slice(source.indexOf('router.post("/projects"'), source.indexOf('router.get("/projects/:id"'));
  const rerenderRoute = source.slice(source.indexOf('router.post("/projects/:id/rerender"'), source.indexOf('router.patch("/projects/:id"'));
  for (const route of [createRoute, rerenderRoute]) {
    const preflight = route.indexOf("requireVideoProviderReadiness");
    assert.ok(preflight >= 0);
    assert.ok(preflight < route.indexOf("db.transaction"));
    assert.ok(preflight < route.indexOf("startVideoProduction"));
  }
});
