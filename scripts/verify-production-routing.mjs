import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const config = JSON.parse(await readFile(new URL("vercel.json", root), "utf8"));
const railway = "https://site-booster-production.up.railway.app/api/:path*";

assert.equal(config.outputDirectory, "artifacts/quae/dist/public", "Vercel must publish the Quae artifact");
assert.deepEqual(config.rewrites?.[0], { source: "/api/:path*", destination: railway }, "Railway API rewrite must be first");
assert.deepEqual(config.rewrites?.[1], { source: "/(.*)", destination: "/index.html" }, "SPA fallback must follow the API rewrite");
assert.equal(config.rewrites.length, 2, "Unexpected production rewrite");
assert.equal(config.redirects, undefined, "API proxy must remain a rewrite so POST bodies and Authorization headers are forwarded");
assert.equal(new URL(config.rewrites[0].destination.replace(":path*", "mockups/existing/generate")).pathname, "/api/mockups/existing/generate");

const configs = [];
for await (const entry of glob("**/vercel.json", { cwd: root, exclude: ["node_modules/**", ".git/**"] })) configs.push(entry);
assert.deepEqual(configs, ["vercel.json"], `Duplicate Vercel configuration: ${configs.join(", ")}`);

const sources = await Promise.all([
  readFile(new URL("vercel.json", root), "utf8"),
  readFile(new URL("artifacts/quae/src/lib/marketing-api.ts", root), "utf8"),
]);
assert.doesNotMatch(sources.join("\n"), /https?:\/\/[^\s"']*replit\.(?:app|dev)/i, "Obsolete Replit production URL found");

if (process.argv.includes("--artifact")) {
  await access(new URL("artifacts/quae/dist/public/index.html", root));
}

console.log("Production routing verified: /api/* -> Railway; browser routes -> Quae SPA");
