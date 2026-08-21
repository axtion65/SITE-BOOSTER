import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

test("approved campaign workspace exposes both visual actions and provider-free preparation",async()=>{const page=await readFile(new URL("../pages/studio/campaign-detail.tsx",import.meta.url),"utf8");assert.match(page,/Choose from My Visuals/);assert.match(page,/Create a New Visual/);assert.match(page,/Prepare Campaign Video/);assert.match(page,/approvedRunId:data\.approved_run_id/);assert.doesNotMatch(page,/credits|Fal|OpenAI|generateVideo/);});
test("Mockup Studio returns the exact completed version to the same campaign",async()=>{const page=await readFile(new URL("../pages/studio/mockups.tsx",import.meta.url),"utf8");assert.match(page,/Use in Campaign/);assert.match(page,/versionId:version\.id/);assert.match(page,/`\/studio\/campaigns\/\$\{campaignId\}`/);});
test("Creative shows the selected source and explicit animate intent before continuation",async()=>{const page=await readFile(new URL("../pages/studio/index.tsx",import.meta.url),"utf8");assert.match(page,/setRenderIntent\("animate"\)/);assert.match(page,/Animate Existing · Confirmed campaign visual loaded/);assert.match(page,/No generation starts until you explicitly continue/);});
