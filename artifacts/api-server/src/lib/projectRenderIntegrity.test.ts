import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { PgDialect, pgTable, text, integer } from "drizzle-orm/pg-core";
import { approvedCampaignBriefToExpandedScript } from "./videoRenderBrief";

// Bundle the actual router; replace only I/O boundaries. No database, provider,
// server, customer account, or credit balance is touched by these regressions.
const boundaryNames = ["@workspace/db", "./auth", "../lib/falvideo", "../lib/videoProduction", "../lib/falProviderReadiness", "../lib/logger", "../lib/objectStorage", "../lib/email", "../lib/tts", "../lib/videoNarrate"];
const built = await build({
  entryPoints: [fileURLToPath(new URL("../routes/projects.ts", import.meta.url))],
  bundle: true, platform: "node", format: "cjs", packages: "external", write: false,
  plugins: [{ name: "project-test-boundaries", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => boundaryNames.includes(args.path)
      ? { path: `test-boundary:${args.path}`, external: true } : undefined);
  } }],
});
const require = createRequire(import.meta.url);
const dialect = new PgDialect();
const projectsTable = pgTable("projects", { id: text("id"), userId: text("user_id"), status: text("status"), renderAttempt: integer("render_attempt"), idempotencyKey: text("idempotency_key") });
const usersTable = pgTable("users", { id: text("id"), credits: integer("credits") });
const creditLedgerTable = pgTable("credit_ledger", { id: text("id") });
const brief = { approvedCopy: "Quae.ai helps small businesses create marketing. Build your campaign today.", hook: "Marketing for small businesses.", cta: "Build your campaign today.", platform: "Instagram", duration: "15s" };
const canonical = approvedCampaignBriefToExpandedScript(brief);
const textAuthority = {
  id: "campaign", user_id: "owner", business_id: "business", business_owner_id: "owner",
  status: "approved", approved_run_id: "run", campaign_run_id: "run", campaign_run_status: "ready_for_review",
  brief: { channel: "Instagram", duration: "15s" }, run_context: {},
  run_final_result: { finalScript: { script: canonical.script, hook: canonical.hook, callToAction: canonical.callToAction }, factcheck: { pass: true }, qa: { pass: true } },
};

function harness(overrides: Record<string, unknown> = {}) {
  const state = {
    project: { id: "project", userId: "owner", status: "failed", campaignId: null, campaignRunId: null, campaignVideoBriefId: null,
      mockupProjectId: null, mockupVersionId: null, productImageUrl: null, sourceAssetId: null,
      title: "Quae ad", description: null, renderingModelId: "ltx-fast", duration: "15s", platform: "instagram", voiceId: "alloy",
      renderIntent: "create_new", script: "old production artifact", expandedScript: JSON.stringify(canonical),
      renderAttempt: 1, createdAt: new Date(), updatedAt: new Date(), ...overrides } as any,
    authority: textAuthority as any, events: [] as string[], queries: [] as { sql: string; params: unknown[] }[],
    projectWrites: 0, debits: 0, ledgerWrites: 0, workers: 0, preflights: 0,
    providerReady: true, sufficientCredits: true, authenticated: true, owned: true,
    onProjectLock: null as (() => void) | null,
  };
  const db: any = {
    select() { return { from(table: unknown) {
      const rows = () => table === projectsTable ? (state.owned ? [{ ...state.project }] : []) : [{ id: "owner", credits: 600, isAdmin: false }];
      const cursor = {
        where(condition: any) { state.queries.push(dialect.sqlToQuery(condition)); return cursor; },
        for(mode: string) { assert.equal(mode, "update"); state.events.push("project-lock"); state.onProjectLock?.(); return Promise.resolve(rows()); },
        then(resolve: any, reject: any) { return Promise.resolve(rows()).then(resolve, reject); },
      };
      return cursor;
    } }; },
    update(table: unknown) { return { set(values: any) { return { where(condition: any) {
      state.queries.push(dialect.sqlToQuery(condition));
      return { async returning() {
        if (table === usersTable) { state.events.push("debit"); state.debits++; return state.sufficientCredits ? [{ credits: 510 }] : []; }
        state.events.push("project-write"); state.projectWrites++;
        state.project = { ...state.project, ...values, renderAttempt: typeof values.renderAttempt === "object" ? state.project.renderAttempt + 1 : state.project.renderAttempt };
        return [{ ...state.project }];
      } };
    } }; } }; },
    insert(table: unknown) { assert.equal(table, creditLedgerTable); return { async values(value: any) {
      assert.equal(value.amount, -90); state.events.push("ledger"); state.ledgerWrites++;
    } }; },
    async execute(query: any) { state.events.push("authority"); state.queries.push(dialect.sqlToQuery(query)); return { rows: state.authority ? [state.authority] : [] }; },
    async transaction(work: (tx: any) => Promise<unknown>) { return work(db); },
  };
  const boundaries: Record<string, any> = {
    "@workspace/db": { db, pool: { query() { throw new Error("Unexpected raw database I/O"); } }, projectsTable, usersTable, creditLedgerTable },
    "./auth": { resolveUserIdFromToken: async () => state.authenticated ? "owner" : null },
    "../lib/falvideo": { MODEL_CREDIT_COSTS: {}, isFalToken: () => false, isWebhookFalToken: () => false, pollFalVideoRender: () => { throw new Error("Provider polling forbidden"); } },
    "../lib/videoProduction": { startVideoProduction(id: string) { assert.equal(id, "project"); state.events.push("worker"); state.workers++; } },
    "../lib/falProviderReadiness": { async checkFalProviderReadiness() { state.events.push("preflight"); state.preflights++; return { ready: state.providerReady, code: "unavailable" }; } },
    "../lib/logger": { logger: { error() {}, warn() {} } },
  };
  const module = { exports: {} as any };
  new Function("require", "module", "exports", built.outputFiles[0]!.text)((id: string) => {
    if (id.startsWith("test-boundary:")) {
      const name = id.slice("test-boundary:".length);
      if (!(name in boundaries)) throw new Error(`Forbidden I/O import: ${name}`);
      return boundaries[name];
    }
    return require(id);
  }, module, module.exports);
  return { state, async request(method: "patch" | "post", body: unknown = {}) {
    const path = method === "patch" ? "/projects/:id" : "/projects/:id/rerender";
    const layer = module.exports.default.stack.find((entry: any) => entry.route?.path === path && entry.route.methods[method]);
    assert.ok(layer, `Actual ${method} ${path} handler must exist`);
    const response = { code: 200, body: null as any, status(code: number) { this.code = code; return this; }, json(value: unknown) { this.body = value; return this; } };
    await layer.route.stack[0].handle({ headers: { authorization: "Bearer test" }, params: { id: "project" }, body }, response);
    return response;
  } };
}

function assertNoProduction(state: ReturnType<typeof harness>["state"]) {
  assert.equal(state.debits, 0); assert.equal(state.ledgerWrites, 0); assert.equal(state.workers, 0); assert.equal(state.projectWrites, 0);
}

test("PATCH cannot set production status, including making an active render retryable", async () => {
  for (const status of ["draft", "preparing", "processing", "assembling", "narrating", "completed", "failed"]) {
    const { state, request } = harness({ status: "processing" });
    assert.equal((await request("patch", { status })).code, 400);
    assert.equal(state.project.status, "processing"); assertNoProduction(state);
  }
});

test("PATCH locks the row and protects every active render input while allowing metadata edits", async () => {
  for (const status of ["preparing", "processing", "assembling", "narrating"]) {
    for (const [key, value] of Object.entries({ renderingModelId: "kling", script: "changed", expandedScript: "changed", platform: "youtube", duration: "45s", voiceId: "nova" })) {
      const { state, request } = harness({ status });
      assert.equal((await request("patch", { [key]: value })).code, 409, `${status}: ${key}`);
      assert.deepEqual(state.events, ["project-lock"]); assertNoProduction(state);
    }
    const { state, request } = harness({ status });
    assert.equal((await request("patch", { title: "Facebook launch", description: "September" })).code, 200);
    assert.equal(state.project.title, "Facebook launch"); assert.equal(state.project.status, status);
    assert.deepEqual(state.events, ["project-lock", "project-write"]);
    assert.ok(state.queries.every(query => query.params.includes("owner") && query.params.includes("project")));
  }
});

test("PATCH reads the locked state so an overlapping retry cannot admit a script edit", async () => {
  const { state, request } = harness();
  state.onProjectLock = () => { state.project.status = "preparing"; };
  assert.equal((await request("patch", { expandedScript: "changed" })).code, 409);
  assertNoProduction(state);
});

test("campaign copy can only change through campaign approval; ordinary inactive edits still work", async () => {
  for (const key of ["script", "expandedScript", "platform", "duration"]) {
    const { state, request } = harness({ campaignId: "campaign", campaignRunId: "run" });
    assert.equal((await request("patch", { [key]: "changed" })).code, 409); assertNoProduction(state);
  }
  const campaign = harness({ campaignId: "campaign", campaignRunId: "run" });
  assert.equal((await campaign.request("patch", { title: "My ad", voiceId: "nova", renderingModelId: "kling" })).code, 200);
  const ordinary = harness();
  assert.equal((await ordinary.request("patch", { expandedScript: JSON.stringify(canonical), duration: "30s" })).code, 200);
});

test("PATCH and retry retain authentication and missing-owner rejection", async () => {
  for (const method of ["patch", "post"] as const) {
    const unauthorized = harness(); unauthorized.state.authenticated = false;
    assert.equal((await unauthorized.request(method, { title: "changed" })).code, 401); assertNoProduction(unauthorized.state);
    const foreign = harness(); foreign.state.owned = false;
    assert.equal((await foreign.request(method, { title: "changed" })).code, 404); assertNoProduction(foreign.state);
  }
});

test("campaign retry rejects a superseded approved run before provider check or debit", async () => {
  const { state, request } = harness({ campaignId: "campaign", campaignRunId: "old-run" });
  assert.equal((await request("post")).code, 409);
  assertNoProduction(state); assert.equal(state.preflights, 0);
  const authority = state.queries.find(query => query.sql.includes("FROM campaigns c"));
  assert.ok(authority); assert.deepEqual(authority.params, ["campaign", "owner"]);
  assert.ok(authority.sql.includes("FOR SHARE OF c,b,r"));
});

test("campaign retry rejects unavailable or unsafe approval and edited approved copy", async () => {
  for (const authority of [null, { ...textAuthority, run_final_result: { ...textAuthority.run_final_result, qa: { pass: false } } }]) {
    const { state, request } = harness({ campaignId: "campaign", campaignRunId: "run" }); state.authority = authority;
    assert.equal((await request("post")).code, 409); assertNoProduction(state); assert.equal(state.preflights, 0);
  }
  for (const changes of [{ expandedScript: JSON.stringify({ ...canonical, voiceoverText: "Unapproved claim" }) }, { platform: "youtube" }]) {
    const { state, request } = harness({ campaignId: "campaign", campaignRunId: "run", ...changes });
    assert.equal((await request("post")).code, 409); assertNoProduction(state);
  }
});

test("campaign animation retry rejects a changed selected visual version or source", async () => {
  for (const changes of [{ mockup_version_id: "new-version" }, { object_path: "/objects/new.png" }]) {
    const { state, request } = harness({ campaignId: "campaign", campaignRunId: "run", campaignVideoBriefId: "brief", renderIntent: "animate", mockupProjectId: "mockup", mockupVersionId: "version", sourceAssetId: "/objects/product.png", productImageUrl: "/api/storage/objects/product.png" });
    state.authority = { campaign_run_id: "run", mockup_project_id: "mockup", mockup_version_id: "version", object_path: "/objects/product.png", brief, ...changes };
    assert.equal((await request("post")).code, 409); assertNoProduction(state); assert.equal(state.preflights, 0);
    const query = state.queries.find(item => item.sql.includes("FROM campaign_video_briefs"));
    assert.deepEqual(query?.params, ["brief", "campaign", "owner"]);
    assert.ok(query?.sql.includes("FOR SHARE OF c,b,vb,s,mp,mv"));
  }
});

test("approved retry restores canonical server scenes before its one charge and worker start", async () => {
  const { state, request } = harness({ campaignId: "campaign", campaignRunId: "run", expandedScript: JSON.stringify({ ...canonical, scenes: [{ description: "Injected unrelated scene", visualDirection: "wrong" }] }) });
  assert.equal((await request("post")).code, 200);
  assert.deepEqual(JSON.parse(state.project.expandedScript), canonical);
  assert.equal(state.debits, 1); assert.equal(state.ledgerWrites, 1); assert.equal(state.workers, 1);
  assert.equal(state.project.status, "preparing"); assert.equal(state.project.renderAttempt, 2);
  assert.deepEqual(state.events, ["project-lock", "authority", "preflight", "debit", "project-write", "ledger", "worker"]);
});

test("active retries and malformed scripts cannot charge or start production", async () => {
  for (const overrides of [{ status: "processing" }, { expandedScript: "invalid-json" }, { expandedScript: JSON.stringify({ voiceoverText: {}, scenes: [{}] }) }]) {
    const { state, request } = harness(overrides);
    assert.ok([400, 409].includes((await request("post")).code)); assertNoProduction(state); assert.equal(state.preflights, 0);
  }
});

test("provider unavailability and insufficient credits do not start a retry", async () => {
  const unavailable = harness(); unavailable.state.providerReady = false;
  assert.equal((await unavailable.request("post")).code, 503); assertNoProduction(unavailable.state);
  const insufficient = harness(); insufficient.state.sufficientCredits = false;
  assert.equal((await insufficient.request("post")).code, 402);
  assert.equal(insufficient.state.workers, 0); assert.equal(insufficient.state.projectWrites, 0); assert.equal(insufficient.state.ledgerWrites, 0);
});
