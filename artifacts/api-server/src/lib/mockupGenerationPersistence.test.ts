import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const routeUrl = new URL("../routes/mockups.ts", import.meta.url);

test("generation persists a version only from the locked owned project", async () => {
  const source = await readFile(routeUrl, "utf8");

  assert.match(
    source,
    /SELECT id FROM mockup_projects WHERE id=\$1 AND user_id=\$2 FOR UPDATE/,
  );
  assert.match(
    source,
    /INSERT INTO mockup_versions[\s\S]*SELECT \$1,mp\.id[\s\S]*FROM mockup_projects mp WHERE mp\.id=\$2 AND mp\.user_id=\$9 RETURNING \*/,
  );
  assert.match(source, /mockup_project_missing_during_generation/);
  assert.match(source, /mockup_version_persistence_failed/);
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
