import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

test("the public site declares its canonical URL and sitemap", async () => {
  const [index, robots, sitemap] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("public/robots.txt", root), "utf8"),
    readFile(new URL("public/sitemap.xml", root), "utf8"),
  ]);

  assert.match(index, /<link rel="canonical" href="https:\/\/quae\.ai\/" \/>/);
  assert.match(robots, /^Sitemap: https:\/\/quae\.ai\/sitemap\.xml$/m);
  for (const privatePath of ["/admin", "/signin", "/studio"]) {
    assert.match(robots, new RegExp(`^Disallow: ${privatePath}$`, "m"));
    assert.doesNotMatch(sitemap, new RegExp(`<loc>https://quae\\.ai${privatePath}`));
  }
  for (const publicPath of ["/", "/how-to", "/privacy", "/terms", "/refund-policy", "/contact"]) {
    assert.match(sitemap, new RegExp(`<loc>https://quae\\.ai${publicPath === "/" ? "/" : publicPath}</loc>`));
  }
});
