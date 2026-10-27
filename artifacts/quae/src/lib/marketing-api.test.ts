import assert from "node:assert/strict";
import test from "node:test";
import { MarketingApiError, privateImageUrl, uploadMarketingImage } from "./marketing-api";

test("private object URLs normalize upload and generated paths exactly once", () => {
  assert.equal(privateImageUrl("/objects/uploads/abc"), "/api/storage/objects/uploads/abc");
  assert.equal(privateImageUrl("/api/storage/objects/uploads/abc"), "/api/storage/objects/uploads/abc");
  assert.equal(privateImageUrl("/objects/mockups/abc"), "/api/storage/objects/mockups/abc");
  assert.equal(privateImageUrl("/api/storage/objects/mockups/abc"), "/api/storage/objects/mockups/abc");
  assert.doesNotMatch(privateImageUrl("/api/storage/objects/foo"), /objects\/\/api\/storage\/objects/);
});

test("failed direct storage uploads report a safe support code", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const reports: Array<Record<string, unknown>> = [];
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => "customer-token" },
  });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "/api/storage/uploads/request-url") {
      return new Response(JSON.stringify({
        uploadURL: "https://storage.example/upload",
        objectPath: "/objects/uploads/test",
        finalizeToken: "finalize-token",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url === "https://storage.example/upload") return new Response(null, { status: 403 });
    if (url === "/api/storage/uploads/report-failure") {
      reports.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ ok: true, requestId: "upload-support-1" }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const file = { name: "customer.png", size: 100, type: "image/png" } as File;
    await assert.rejects(
      uploadMarketingImage(file),
      (error: unknown) => error instanceof MarketingApiError
        && error.requestId === "upload-support-1"
        && error.message.includes("Support code: upload-support-1"),
    );
    assert.deepEqual(reports, [{ stage: "storage_put", statusCode: 403 }]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalLocalStorage) Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});
