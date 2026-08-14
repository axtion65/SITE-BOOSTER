import test from "node:test";import assert from "node:assert/strict";
test("approved handoff contract carries authoritative visual",()=>{const handoff={source:"approved_mockup",authoritativeImagePath:"/objects/mockups/a.png"};assert.equal(handoff.source,"approved_mockup");assert.match(handoff.authoritativeImagePath,/^\/objects\//)});
