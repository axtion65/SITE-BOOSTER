import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { studioMockupUrl } from "./mockup-library.js";

const visuals=fs.readFileSync(new URL("../pages/studio/visuals.tsx",import.meta.url),"utf8");
const studio=fs.readFileSync(new URL("../pages/studio/mockups.tsx",import.meta.url),"utf8");
const shared=fs.readFileSync(new URL("../pages/studio/marketing-shared.tsx",import.meta.url),"utf8");

test("reopening keeps the durable project id across a reload",()=>{
  assert.equal(studioMockupUrl("project one"),"/studio/mockups?projectId=project%20one");
  assert.match(studio,/marketingApi<Project>\(`\/mockups\/\$\{existingId\}`\)/);
});

test("visual library offers all versions and a secure download",()=>{
  assert.match(visuals,/project\.versions\.map/);
  assert.match(visuals,/downloadMockupVersion\(selected,project\.product_name\)/);
  assert.match(visuals,/MarketingImage objectPath=\{selected\.object_path\}/);
  assert.match(shared,/usePrivateImageUrl/);
});

test("missing or unauthorized projects show a safe message",()=>{
  assert.match(studio,/It may not exist or belong to this account/);
});
