import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const repositoryRoot = new URL("../../../../", import.meta.url);

test("the public site gives each discoverable route one canonical URL", async () => {
  const [index, robots, sitemap, vercelSource] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("public/robots.txt", root), "utf8"),
    readFile(new URL("public/sitemap.xml", root), "utf8"),
    readFile(new URL("vercel.json", repositoryRoot), "utf8"),
  ]);
  const vercel = JSON.parse(vercelSource) as {
    headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  };
  const routeHeaders = new Map(vercel.headers.map((entry) => [entry.source, entry.headers]));

  assert.doesNotMatch(index, /rel="canonical"/);
  assert.match(robots, /^Sitemap: https:\/\/quae\.ai\/sitemap\.xml$/m);
  assert.doesNotMatch(robots, /^Disallow:/m);

  for (const privatePath of ["/admin/:path*", "/signin", "/studio/:path*"]) {
    assert.deepEqual(routeHeaders.get(privatePath), [
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ]);
    const sitemapPath = privatePath.split("/")[1];
    assert.doesNotMatch(sitemap, new RegExp(`<loc>https://quae\\.ai/${sitemapPath}`));
  }

  for (const publicPath of ["/", "/how-to", "/templates", "/privacy", "/terms", "/refund-policy", "/contact"]) {
    const canonical = publicPath === "/" ? "https://quae.ai/" : `https://quae.ai${publicPath}`;
    assert.deepEqual(routeHeaders.get(publicPath), [
      { key: "Link", value: `<${canonical}>; rel=\"canonical\"` },
    ]);
    assert.match(sitemap, new RegExp(`<loc>https://quae\\.ai${publicPath === "/" ? "/" : publicPath}</loc>`));
  }
});
