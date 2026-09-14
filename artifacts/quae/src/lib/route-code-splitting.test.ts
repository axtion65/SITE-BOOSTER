import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

test("customer workspace and admin routes load on demand", () => {
  for (const page of [
    "StudioLayout",
    "StudioIndex",
    "StudioProjects",
    "StudioDashboard",
    "CampaignsPage",
    "MockupsPage",
    "Templates",
    "Admin",
  ]) {
    assert.match(app, new RegExp(`const ${page} = lazy\\(`));
  }

  assert.match(app, /<Suspense fallback=\{<RouteLoading \/>\}>/);
  assert.doesNotMatch(app, /import Admin from ['"]@\/pages\/admin['"]/);
  assert.doesNotMatch(app, /import StudioLayout from ['"]@\/pages\/studio\/layout['"]/);
});

test("the storefront and sign-in route remain in the first customer bundle", () => {
  assert.match(app, /import Home from ['"]@\/pages\/home['"]/);
  assert.match(app, /import SignIn from ['"]@\/pages\/signin['"]/);
  assert.match(app, /import HowTo from ['"]@\/pages\/how-to['"]/);
});
