import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { constrainVoiceoverText } from "./videoProductionPlan";

// Exercise the actual private worker context with database/provider I/O isolated.
const source = await readFile(new URL("./videoProduction.ts", import.meta.url), "utf8");
const boundaries = ["@workspace/db", "./falvideo", "./tts", "./mediaProbe", "./objectStorage", "./email"];
const built = await build({
  stdin: { contents: `${source}\nexport { productionContext as testedProductionContext };`, resolveDir: fileURLToPath(new URL(".", import.meta.url)), sourcefile: "videoProduction.ts", loader: "ts" },
  bundle: true, platform: "node", format: "cjs", packages: "external", write: false,
  plugins: [{ name: "production-context-boundaries", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => boundaries.includes(args.path) ? { path: `test-boundary:${args.path}`, external: true } : undefined);
  } }],
});
const require = createRequire(import.meta.url);
const project = { userId: "owner", campaignId: "campaign", campaignRunId: "approved-run", sourceAssetId: "/objects/confirmed.png", title: "Quae.ai Ad" };
const profile = { name: "Big Al's", website: "https://bigal.example", logo_object_path: "/objects/bigal-logo.png", primary_color: "#123456", primary_cta: "Visit Big Al's" };
const approved = { identity: { name: "Quae.ai", website: "https://www.quae.ai/" }, ctaEvidence: "Start building your campaign today.", sourceUrl: "https://www.quae.ai/" };

async function context(row: any, overrides: Record<string, unknown> = {}) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const module = { exports: {} as any };
  new Function("require", "module", "exports", built.outputFiles[0]!.text)((id: string) => {
    if (id === "test-boundary:@workspace/db") return { db: {}, pool: { async query(sql: string, values: unknown[]) { queries.push({ sql, values }); return { rows: row ? [row] : [] }; } } };
    if (id.startsWith("test-boundary:")) return new Proxy({}, { get() { throw new Error(`Production I/O forbidden: ${id}`); } });
    return require(id);
  }, module, module.exports);
  return { result: await module.exports.testedProductionContext({ ...project, ...overrides }), queries };
}

test("campaign video narration and end-card branding use the exact approved run identity", async () => {
  const { result, queries } = await context({ ...profile, context_snapshot: approved });
  assert.equal(result.brand.name, "Quae.ai");
  assert.equal(result.brand.website, "https://www.quae.ai/");
  assert.equal(result.brand.callToAction, approved.ctaEvidence);
  assert.equal(result.brand.logoObjectPath, null);
  assert.equal(result.brand.primaryColor, null);
  assert.deepEqual(result.sourceAssetPaths, ["/objects/confirmed.png"]);
  assert.deepEqual(queries[0]!.values, ["owner", "campaign", "approved-run"]);
  assert.match(queries[0]!.sql, /JOIN campaign_runs r ON r\.campaign_id=c\.id AND r\.id=\$3/);
  assert.match(queries[0]!.sql, /c\.approved_run_id=r\.id/);
  const script = { voiceoverText: "Small business, big marketing goals? Quae.ai makes your video ads. Start building your campaign today.", script: "", callToAction: approved.ctaEvidence } as any;
  const narration = constrainVoiceoverText({ script, duration: "15s", brandName: result.brand.name });
  assert.doesNotMatch(narration, /Big Al/);
  assert.match(narration, /Quae\.ai/);
});

test("nested imported campaign identity keeps its own website instead of the general profile", async () => {
  const { result } = await context({ ...profile, context_snapshot: { generationContext: { identity: { name: "Quae.ai" }, ctaEvidence: approved.ctaEvidence }, sourceUrl: "https://www.quae.ai/" } });
  assert.equal(result.brand.name, "Quae.ai");
  assert.equal(result.brand.website, "https://www.quae.ai/");
});

test("ordinary approved campaigns preserve their frozen business and brand kit", async () => {
  const { result } = await context({ ...profile, context_snapshot: { business: { name: "Original Brand", website: "https://original.example", cta: "Shop original" }, brand: { logos: ["/objects/original-logo.png"], colors: { primary: "#abcdef" } } } });
  assert.equal(result.brand.name, "Original Brand");
  assert.equal(result.brand.website, "https://original.example");
  assert.equal(result.brand.logoObjectPath, "/objects/original-logo.png");
  assert.equal(result.brand.primaryColor, "#abcdef");
});

test("missing campaign authority fails before production instead of falling back to a title", async () => {
  await assert.rejects(context(null), /approved campaign identity/i);
});

test("standalone videos retain the saved business profile and exact selected source", async () => {
  const { result, queries } = await context(profile, { campaignId: null, campaignRunId: null });
  assert.equal(result.brand.name, "Big Al's");
  assert.equal(result.brand.website, "https://bigal.example");
  assert.equal(result.brand.logoObjectPath, "/objects/bigal-logo.png");
  assert.deepEqual(queries[0]!.values, ["owner"]);
});
