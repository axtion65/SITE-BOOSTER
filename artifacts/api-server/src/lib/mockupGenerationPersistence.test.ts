import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { authoritativeMockupProjectId, lockProjectAndPersistGeneration, MockupProjectUnavailableError } from "./mockupGenerationPersistence";

const routeUrl = new URL("../routes/mockups.ts", import.meta.url);

test("route loads and locks the authoritative project on the same transaction client", async () => {
  const source = await readFile(routeUrl, "utf8");
  assert.match(source, /client=await pool\.connect\(\);[\s\S]*project_load[\s\S]*await client\.query[\s\S]*BEGIN[\s\S]*lockProjectAndPersistGeneration/);
  assert.match(source, /lockProjectAndPersistGeneration\(\{client,projectId,userId/);
  assert.match(source, /mockup_version_persistence_failed/);
});

test("a flattened business id cannot replace the route's mockup-project identity", async () => {
  const routeMockupId = "mockup-project-17";
  const flattenedProject = {
    mockup_project_id: routeMockupId,
    id: "business-42",
  };

  assert.notEqual(flattenedProject.id, routeMockupId, "reproduces the mp.id/b.id collision");
  assert.equal(authoritativeMockupProjectId(flattenedProject, routeMockupId), routeMockupId);
  assert.throws(
    () => authoritativeMockupProjectId(flattenedProject, "different-route-project"),
    /mockup_project_identity_mismatch/,
  );

  const calls: Array<{ text: string; values?: unknown[] }> = [];
  const version = { id: "version-1", mockup_project_id: routeMockupId, version_number: 1 };
  await lockProjectAndPersistGeneration({
    ...input(clientFor([[{ id: routeMockupId }], [], [], [{ n: 1 }], [version], []], calls)),
    projectId: authoritativeMockupProjectId(flattenedProject, routeMockupId),
  });
  const lock = calls.find(call => call.text.includes("FOR UPDATE"));
  const insert = calls.find(call => call.text.startsWith("INSERT INTO mockup_versions"));
  assert.deepEqual(lock?.values, [routeMockupId, "owner-1"]);
  assert.equal(insert?.values?.[1], routeMockupId);
  assert.ok(calls.every(call => !call.values?.includes(flattenedProject.id)));

  const source = await readFile(routeUrl, "utf8");
  assert.match(source, /mp\.id AS mockup_project_id/);
  assert.doesNotMatch(
    source.slice(source.indexOf('router.post("/mockups/:id/generate"'), source.indexOf('router.post("/mockups/:id/versions"')),
    /projectId:project\.id|mockupId:project\.id/,
  );
});

function clientFor(rows: any[][], calls: Array<{ text: string; values?: unknown[] }>) {
  return { query: async (text: string, values?: unknown[]) => { calls.push({ text, values }); return { rows: rows.shift() ?? [] }; } };
}

const input = (client: any) => ({ client, projectId: "project-1", userId: "owner-1", idempotencyKey: "retry-1", creationPath: "studio", productReferencePaths: ["/objects/ref"], brandModelId: null, createVersionId: () => "version-1" });

test("an existing owned project locks and creates its first version with one identity", async () => {
  const calls: Array<{ text: string; values?: unknown[] }> = [];
  const version = { id: "version-1", mockup_project_id: "project-1", version_number: 1 };
  const result = await lockProjectAndPersistGeneration(input(clientFor([[{ id: "project-1" }], [], [], [{ n: 1 }], [version], []], calls)));
  assert.equal(result.created, true);
  assert.equal(result.version, version);
  const identityCalls = calls.filter(call => /mockup_projects|mockup_project_id/.test(call.text));
  assert.ok(identityCalls.every(call => call.values?.includes("project-1")));
  assert.deepEqual(calls[0]!.values, ["project-1", "owner-1"]);
  assert.equal(calls.filter(call => call.text.startsWith("INSERT INTO mockup_versions")).length, 1);
});

test("a genuinely missing or concurrently deleted project is rejected before insert", async () => {
  for (const label of ["missing", "concurrently deleted"]) {
    const calls: Array<{ text: string }> = [];
    await assert.rejects(lockProjectAndPersistGeneration(input(clientFor([[]], calls))), (error: unknown) => error instanceof MockupProjectUnavailableError && error.lookupStage === "project_lock", label);
    assert.equal(calls.some(call => call.text.startsWith("INSERT")), false);
  }
});

test("database failures remain query failures rather than missing-project errors", async () => {
  const client = { query: async () => { const error = new Error("connection reset"); (error as any).code = "08006"; throw error; } };
  await assert.rejects(lockProjectAndPersistGeneration(input(client)), error => !(error instanceof MockupProjectUnavailableError) && (error as any).code === "08006");
});

test("idempotent retry returns its version without another insert or provider work", async () => {
  const calls: Array<{ text: string }> = [];
  const existing = { id: "version-existing", mockup_project_id: "project-1" };
  const result = await lockProjectAndPersistGeneration(input(clientFor([[{ id: "project-1" }], [existing]], calls)));
  assert.equal(result.created, false);
  assert.equal(result.version, existing);
  assert.equal(calls.some(call => call.text.startsWith("INSERT")), false);
});

test("paid provider execution exists only in the background worker", async () => {
  const route = await readFile(routeUrl, "utf8");
  const worker = await readFile(new URL("./mockupWorker.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route.slice(route.indexOf('router.post("/mockups/:id/generate"'), route.indexOf('router.post("/mockups/:id/versions"')), /queue\.submit|queue\.result/);
  assert.match(worker, /status='provider_submitting'/);
  assert.match(worker, /queue\.submit/);
  assert.match(worker, /provider_job_ref=\$2/);
  assert.match(worker, /queue\.result/);
  assert.match(worker, /status='saving_asset'/);
  assert.match(worker, /FOR UPDATE SKIP LOCKED/);
});

test("private references are ingested before any paid provider submission", async () => {
  const worker = await readFile(new URL("./mockupWorker.ts", import.meta.url), "utf8");
  const download = worker.indexOf("await fetch(signedUrl");
  const upload = worker.indexOf("storage.upload(file)");
  const submit = worker.indexOf("queue.submit");
  assert.ok(download >= 0);
  assert.ok(upload > download);
  assert.ok(submit > upload);
  assert.match(worker, /reference_payload_not_image/);
  assert.match(worker, /new File\(\[blob\]/);
  assert.match(worker, /reference_upload_missing_url/);
});

test("worker normalizes and signs preserved uploads keys before provider submission", async () => {
  const worker=await readFile(new URL("./mockupWorker.ts",import.meta.url),"utf8");
  assert.match(worker,/getSignedObjectEntityUrl\(normalizeStoragePath\(path\),900\)/);
  assert.ok(worker.indexOf("getSignedObjectEntityUrl(normalizeStoragePath(path),900)")<worker.indexOf("queue.submit"));
});
