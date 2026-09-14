import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { downloadProjectVideo, type VideoDownloadRuntime } from "./video-download";

function downloadFixture(response: Response) {
  const requests: Array<{ url: string; headers: Headers }> = [];
  const revoked: string[] = [];
  const blobs: Blob[] = [];
  const link = { href: "", download: "", clicks: 0, click() { this.clicks++; } };
  const runtime: VideoDownloadRuntime = {
    async fetch(input, init) { requests.push({ url: String(input), headers: new Headers(init?.headers) }); return response; },
    headers: () => ({ Authorization: "Bearer customer-session" }),
    createObjectUrl(blob) { blobs.push(blob); return "blob:customer-video"; },
    revokeObjectUrl: url => { revoked.push(url); },
    createLink: () => link,
  };
  return { runtime, requests, revoked, blobs, link };
}

test("campaign downloads send authentication and save the server MP4 filename", async () => {
  const fixture = downloadFixture(new Response(new Uint8Array([0, 1, 2]), {
    headers: { "Content-Type": "video/mp4", "Content-Disposition": 'attachment; filename="quae-ad.mp4"' },
  }));
  await downloadProjectVideo("owned-project", fixture.runtime);
  assert.equal(fixture.requests[0].url, "/api/projects/owned-project/video/download");
  assert.equal(fixture.requests[0].headers.get("authorization"), "Bearer customer-session");
  assert.equal(fixture.link.href, "blob:customer-video");
  assert.equal(fixture.link.download, "quae-ad.mp4");
  assert.equal(fixture.link.clicks, 1);
  assert.equal(fixture.blobs[0].type, "video/mp4");
  assert.deepEqual(fixture.revoked, ["blob:customer-video"]);
});

for (const status of [401, 403, 404, 409, 503]) {
  test(`HTTP ${status} retains the error instead of downloading an error document`, async () => {
    const fixture = downloadFixture(Response.json({ error: "Video is unavailable" }, { status }));
    await assert.rejects(downloadProjectVideo("owned-project", fixture.runtime), /Video is unavailable/);
    assert.equal(fixture.link.clicks, 0);
    assert.equal(fixture.blobs.length, 0);
  });
}

test("a failed proxy response has a readable fallback and creates no file", async () => {
  const fixture = downloadFixture(new Response("Bad gateway", { status: 502 }));
  await assert.rejects(downloadProjectVideo("owned-project", fixture.runtime), /temporarily unavailable/);
  assert.equal(fixture.link.clicks, 0);
});

test("video IDs stay in the authenticated route and do not become a separate URL", async () => {
  const fixture = downloadFixture(new Response("video"));
  await downloadProjectVideo("https://example.com/?token=private", fixture.runtime);
  assert.equal(fixture.requests[0].url, "/api/projects/https%3A%2F%2Fexample.com%2F%3Ftoken%3Dprivate/video/download");
  assert.equal(fixture.link.download, "quae-video.mp4");
});

test("both customer pages use the shared authenticated download without raw navigation", () => {
  for (const page of ["campaign-detail", "project-detail"]) {
    const source = readFileSync(new URL(`../pages/studio/${page}.tsx`, import.meta.url), "utf8");
    assert.match(source, /await downloadProjectVideo\(/);
    assert.doesNotMatch(source, /href=\{`\/api\/projects\//);
    assert.match(source, /Download unavailable/);
  }
});
