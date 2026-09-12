import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const email = readFileSync(new URL("./email.ts", import.meta.url), "utf8");
const auth = readFileSync(new URL("../routes/auth.ts", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../../../../lib/db/migrations/0021_tutorial_email_onboarding.sql", import.meta.url),
  "utf8",
);

test("new signup welcome email links to the public tutorial without stale credit claims", () => {
  assert.match(email, /TUTORIAL_URL = "https:\/\/quae\.ai\/how-to"/);
  assert.match(email, /sendWelcomeEmail/);
  assert.match(email, /Watch the Step-by-Step Tutorial/);
  assert.match(email, /Watching the tutorial does not use campaign credits/);
  assert.doesNotMatch(email, /300 free credits/);
  assert.match(auth, /sendWelcomeEmail\(user\.email, user\.name \?\? ""\)/);
});

test("existing active users receive one durable tutorial email without an admin broadcast", () => {
  assert.match(migration, /INSERT INTO email_queue/);
  assert.match(migration, /'tutorial-onboarding:' \|\| id/);
  assert.match(migration, /WHERE account_status = 'active'/);
  assert.match(migration, /ON CONFLICT \(id\) DO NOTHING/);
  assert.match(migration, /https:\/\/quae\.ai\/how-to/);
});
