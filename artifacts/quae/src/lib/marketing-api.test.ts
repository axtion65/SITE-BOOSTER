import assert from "node:assert/strict";
import test from "node:test";

import { uploadMarketingImage } from "./marketing-api";

test("image upload requests and PUTs with the same content type without network calls", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => "token" },
  });
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    if (calls.length === 1) {
      return Response.json({ uploadURL: "https://storage.test/upload", objectPath: "/objects/upload", finalizeToken: "once" });
    }
    if (calls.length === 2) return new Response(null, { status: 200 });
    return Response.json({ ok: true });
  }) as typeof fetch;

  try {
    const file = new File(["png"], "reference.png", { type: "image/png" });
    assert.equal(await uploadMarketingImage(file), "/objects/upload");
    assert.equal(JSON.parse(String(calls[0].init?.body)).contentType, "image/png");
    assert.equal(new Headers(calls[1].init?.headers).get("Content-Type"), "image/png");
    assert.equal(calls[1].init?.body, file);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalLocalStorage });
  }
});

test("image upload surfaces a safe provider error", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null } });
  let call = 0;
  globalThis.fetch = (async () => ++call === 1
    ? Response.json({ uploadURL: "https://storage.test/upload", objectPath: "/objects/upload", finalizeToken: "once" })
    : Response.json({ error: "Upload signature expired" }, { status: 403 })) as typeof fetch;
  try {
    await assert.rejects(uploadMarketingImage(new File(["x"], "x.webp", { type: "image/webp" })), /Upload signature expired/);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalLocalStorage });
  }
});
