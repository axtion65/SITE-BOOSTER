import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
test("generation presents the API safe message and support code",async()=>{const api=await readFile(new URL("./marketing-api.ts",import.meta.url),"utf8");const page=await readFile(new URL("../pages/studio/mockups.tsx",import.meta.url),"utf8");assert.match(api,/MarketingApiError/);assert.match(api,/data\?\.requestId/);assert.match(page,/apiError\.message/);assert.match(page,/Support code/);assert.doesNotMatch(page,/title:"We couldn’t create this visual\. Try again\."/);});
