import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as ts from "typescript";
import * as drizzle from "drizzle-orm";
import { pgTable, text, PgDialect } from "drizzle-orm/pg-core";
import * as plans from "@workspace/plans";
import * as policy from "./subscriptionCreditPolicy";

// Execute the production handlers, service, reconciler and storage with explicit
// in-memory dependencies. Any unexpected import fails instead of reaching a
// database, Stripe, email or another external service.
function loadSource(relative: string, dependencies: Record<string, unknown>): any {
  const source = readFileSync(new URL(relative, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports, Buffer, Date,
    console: { log() {}, warn() {}, error() {} },
    process: { env: { STRIPE_WEBHOOK_SECRET: "whsec_fixture" } },
    require(name: string) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

function subscription(id: string, status = "active", plan = "pro") {
  return {
    id, status, customer: "cus_fixture", start_date: 1_790_000_000,
    items: { data: [{ price: { id: `price_${plan}` } }] },
  };
}

function createHarness() {
  const usersTable = pgTable("users", {
    id: text("id"), stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
  });
  const dialect = new PgDialect();
  const state = {
    user: {
      id: "user_fixture", email: "fixture@example.invalid", name: "Fixture", isAdmin: false,
      stripeCustomerId: "cus_fixture" as string | null,
      stripeSubscriptionId: null as string | null,
      subscriptionStatus: null as string | null,
      plan: "free", credits: 90, billingInterval: null as string | null,
      creditCycleAnchorAt: null as Date | null, creditRefreshAt: null as Date | null,
    },
    event: { id: "evt_fixture", type: "customer.subscription.updated", data: { object: subscription("sub_new") } },
    remote: new Map<string, ReturnType<typeof subscription>>(),
    listFailure: false, retrieveFailure: false,
    beforeTransaction: null as null | (() => void),
    checkoutCalls: [] as any[], portalCalls: [] as any[],
    writes: [] as { sql: string; params: unknown[]; values: any }[],
    grants: [] as any[], ledgerSuccess: [] as string[], ledgerFailure: [] as string[],
    retrieved: [] as string[],
  };
  function matches(where: drizzle.SQL) {
    const query = dialect.sqlToQuery(where);
    const values: Record<string, unknown> = {
      id: state.user.id,
      stripe_customer_id: state.user.stripeCustomerId,
      stripe_subscription_id: state.user.stripeSubscriptionId,
    };
    const comparisons = [...query.sql.matchAll(/"users"\."([^"]+)" = \$(\d+)/g)];
    assert.ok(comparisons.length > 0, "An update must have a user identity predicate");
    assert.doesNotMatch(query.sql, /\bor\b/i);
    return comparisons.every(([, column, parameter]) => values[column] === query.params[Number(parameter) - 1]);
  }
  const db: any = {
    select: () => ({ from: () => ({ where: async (where: drizzle.SQL) => matches(where) ? [{ ...state.user }] : [] }) }),
    update: () => ({ set: (values: any) => ({ where: (where: drizzle.SQL) => ({ returning: async () => {
      state.writes.push({ ...dialect.sqlToQuery(where), values });
      if (!matches(where)) return [];
      Object.assign(state.user, values);
      return [{ ...state.user }];
    } }) }) }),
    insert: () => ({ values: async (values: any) => { state.grants.push(values); } }),
    execute: async () => {},
    transaction: async (run: (tx: any) => unknown) => {
      state.beforeTransaction?.();
      state.beforeTransaction = null;
      return run(db);
    },
  };
  const dbDependencies = { db, usersTable, creditLedgerTable: {} };
  const { storage } = loadSource("../storage.ts", {
    "@workspace/db": dbDependencies, "@workspace/plans": plans, "drizzle-orm": drizzle,
  });
  const reconciler = loadSource("./subscriptionCredits.ts", {
    "@workspace/db": dbDependencies, "@workspace/plans": plans, "drizzle-orm": drizzle,
    "./subscriptionCreditPolicy": policy,
  });
  const stripe = {
    customers: { create: async () => ({ id: "cus_fixture" }) },
    subscriptions: {
      list(options: { status?: string }) {
        if (state.listFailure) throw new Error("Subscription list unavailable");
        const data = [...state.remote.values()].filter(sub => !options.status || options.status === "all" || sub.status === options.status);
        return Object.assign(Promise.resolve({ data }), { async *[Symbol.asyncIterator]() { yield* data; } });
      },
      retrieve: async (id: string) => {
        state.retrieved.push(id);
        if (state.retrieveFailure || !state.remote.has(id)) throw new Error("Subscription lookup unavailable");
        return structuredClone(state.remote.get(id));
      },
    },
    prices: { retrieve: async (id: string) => ({
      product: { id: "prod_fixture", metadata: { plan: id.replace("price_", "") } },
      recurring: { interval: "month" },
    }) },
    checkout: { sessions: { create: async (input: any) => {
      state.checkoutCalls.push(input); return { url: "https://checkout.stripe.com/fixture" };
    } } },
    billingPortal: { sessions: { create: async (input: any) => {
      state.portalCalls.push(input); return { url: "https://billing.stripe.com/fixture" };
    } } },
    webhooks: { constructEvent: () => state.event },
  };
  const billingConfig = {
    isStripeCheckoutReady: () => true, verifyStripeCatalog: async () => true,
    getPublicAppOrigin: () => "https://quae.ai", resolveStripePriceId: () => "price_pro",
  };
  const { stripeService } = loadSource("../stripeService.ts", {
    "./storage": { storage }, "./stripeClient": { getStripeClient: () => stripe },
    "@workspace/plans": plans, "./lib/billingConfig": billingConfig,
    "./lib/subscriptionCredits": reconciler,
  });
  const routes: Record<string, (req: any, res: any) => Promise<void>> = {};
  loadSource("../routes/billing.ts", {
    express: { Router: () => ({ get() {}, post(path: string, handler: any) { routes[path] = handler; } }) },
    "../storage": { storage }, "../stripeService": { stripeService },
    "./auth": { resolveUserIdFromToken: async () => state.user.id },
    "../lib/billingConfig": billingConfig, "../lib/safeErrorMetadata": { safeErrorMetadata: () => ({}) },
  });
  const { WebhookHandlers } = loadSource("../webhookHandlers.ts", {
    "./stripeClient": { getStripeClient: () => stripe }, "./storage": { storage },
    "./stripeService": { stripeService },
    "./lib/stripeWebhookLedger": {
      recordStripeWebhookAttempt: async () => "process",
      recordStripeWebhookSuccess: async (id: string) => { state.ledgerSuccess.push(id); },
      recordStripeWebhookFailure: async (id: string) => { state.ledgerFailure.push(id); },
    },
    "./lib/logger": { logger: { info() {}, error() {} } },
    "./lib/safeErrorMetadata": { safeErrorMetadata: () => ({}) },
  });
  return {
    state, storage, stripeService,
    webhook: () => WebhookHandlers.processWebhook(Buffer.from("fixture"), "fixture"),
    async checkout() {
      const response = { statusCode: 200, body: {} as any, status(status: number) { this.statusCode = status; return this; }, json(body: any) { this.body = body; } };
      await routes["/billing/checkout"]({ headers: { authorization: "Bearer fixture" }, body: { priceId: "price_pro" } }, response);
      return response;
    },
  };
}

for (const status of ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"]) {
  test(`checkout routes an existing ${status} subscription to the portal even before its local webhook`, async () => {
    const { state, checkout } = createHarness();
    state.remote.set("sub_existing", subscription("sub_existing", status, "starter"));
    const response = await checkout();
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.url, "https://billing.stripe.com/fixture");
    assert.equal(state.checkoutCalls.length, 0);
    assert.equal(state.portalCalls[0].customer, "cus_fixture");
  });
}

test("a new customer receives one subscription Checkout session", async () => {
  const { state, checkout } = createHarness();
  state.user.stripeCustomerId = null;
  const response = await checkout();
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.url, "https://checkout.stripe.com/fixture");
  assert.equal(state.checkoutCalls.length, 1);
  assert.equal(state.checkoutCalls[0].mode, "subscription");
  assert.equal(state.checkoutCalls[0].customer, state.user.stripeCustomerId);
  assert.equal(state.portalCalls.length, 0);
});

test("ended subscriptions allow a new checkout but an existing later subscription still blocks it", async () => {
  const { state, checkout } = createHarness();
  state.remote.set("sub_canceled", subscription("sub_canceled", "canceled"));
  state.remote.set("sub_expired", subscription("sub_expired", "incomplete_expired"));
  assert.equal((await checkout()).body.url, "https://checkout.stripe.com/fixture");
  state.remote.set("sub_current", subscription("sub_current"));
  assert.equal((await checkout()).body.url, "https://billing.stripe.com/fixture");
  assert.equal(state.checkoutCalls.length, 1);
});

test("a failed subscription lookup creates no checkout or portal session", async () => {
  const { state, checkout } = createHarness();
  state.listFailure = true;
  assert.equal((await checkout()).statusCode, 500);
  assert.equal(state.checkoutCalls.length + state.portalCalls.length, 0);
});

test("checkout return and repeated webhook reconciliation grant the ordinary customer exactly one correct allowance", async () => {
  const { state, stripeService, webhook } = createHarness();
  state.remote.set("sub_new", subscription("sub_new"));
  const result = await stripeService.syncUserSubscription(state.user.id);
  assert.equal(result.user.plan, "pro");
  assert.equal(result.user.credits, 2000);
  assert.equal(state.grants.length, 1);
  state.user.credits = 1700;
  await webhook();
  assert.equal(state.user.credits, 1700);
  assert.equal(state.grants.length, 1);
});

test("an obsolete update cannot replace a currently active subscription", async () => {
  const { state, webhook } = createHarness();
  Object.assign(state.user, { stripeSubscriptionId: "sub_current", subscriptionStatus: "active", plan: "pro", credits: 1700 });
  state.event.data.object = subscription("sub_old", "active", "starter");
  state.remote.set("sub_old", subscription("sub_old", "canceled", "starter"));
  state.remote.set("sub_current", subscription("sub_current"));
  await webhook();
  assert.equal(state.user.stripeSubscriptionId, "sub_current");
  assert.equal(state.user.credits, 1700);
  assert.equal(state.writes.length, 0);
});

test("a new subscription activates when the old one ended even before its deletion webhook", async () => {
  const { state, webhook } = createHarness();
  Object.assign(state.user, { stripeSubscriptionId: "sub_old", subscriptionStatus: "active", plan: "starter", credits: 400 });
  state.remote.set("sub_old", subscription("sub_old", "canceled", "starter"));
  state.remote.set("sub_new", subscription("sub_new"));
  await webhook();
  assert.equal(state.user.stripeSubscriptionId, "sub_new");
  assert.equal(state.user.plan, "pro");
  assert.equal(state.user.credits, 2000);
  state.event.type = "customer.subscription.deleted";
  state.event.data.object = subscription("sub_old", "canceled", "starter");
  await webhook();
  assert.equal(state.user.stripeSubscriptionId, "sub_new");
  assert.equal(state.user.credits, 2000);
  const deletion = state.writes.at(-1)!;
  assert.match(deletion.sql, /"users"\."id" = \$1 and "users"\."stripe_subscription_id" = \$2/);
  assert.deepEqual(deletion.params, [state.user.id, "sub_old"]);
});

test("the row lock prevents replacement when another subscription won after the Stripe lookup", async () => {
  const { state, webhook } = createHarness();
  state.user.stripeSubscriptionId = "sub_old";
  state.remote.set("sub_old", subscription("sub_old", "canceled"));
  state.remote.set("sub_new", subscription("sub_new"));
  state.beforeTransaction = () => Object.assign(state.user, { stripeSubscriptionId: "sub_winner", plan: "agency", credits: 6000 });
  await webhook();
  assert.equal(state.user.stripeSubscriptionId, "sub_winner");
  assert.equal(state.user.credits, 6000);
  assert.equal(state.writes.length, 0);
});

test("a stale same-subscription event uses current Stripe status instead of restoring old status", async () => {
  const { state, webhook } = createHarness();
  Object.assign(state.user, { stripeSubscriptionId: "sub_new", subscriptionStatus: "past_due", plan: "pro", credits: 1700 });
  state.remote.set("sub_new", subscription("sub_new", "past_due"));
  await webhook();
  assert.equal(state.user.subscriptionStatus, "past_due");
  assert.equal(state.user.credits, 1700);
  assert.equal(state.grants.length, 0);
});

test("a failed authoritative lookup leaves entitlement unchanged and records webhook failure", async () => {
  const { state, webhook } = createHarness();
  Object.assign(state.user, { stripeSubscriptionId: "sub_current", plan: "agency", credits: 6000 });
  state.remote.set("sub_new", subscription("sub_new"));
  await assert.rejects(webhook, /Subscription lookup unavailable/);
  assert.equal(state.user.stripeSubscriptionId, "sub_current");
  assert.equal(state.user.credits, 6000);
  assert.equal(state.writes.length, 0);
  assert.deepEqual(state.ledgerFailure, ["evt_fixture"]);
  assert.equal(state.ledgerSuccess.length, 0);
});

test("deleting the current subscription downgrades it once while duplicate deletion does not reset free credits", async () => {
  const { state, webhook } = createHarness();
  Object.assign(state.user, { stripeSubscriptionId: "sub_new", plan: "pro", credits: 1700 });
  state.event.type = "customer.subscription.deleted";
  state.event.data.object = subscription("sub_new", "canceled");
  await webhook();
  assert.equal(state.user.stripeSubscriptionId, null);
  assert.equal(state.user.plan, "free");
  assert.equal(state.user.credits, 90);
  state.user.credits = 30;
  await webhook();
  assert.equal(state.user.credits, 30);
});
