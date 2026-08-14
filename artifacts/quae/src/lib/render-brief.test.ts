import assert from "node:assert/strict";
import test from "node:test";
import { compilePreviewRenderBrief } from "./render-brief";
const script: any = { hook:"Wear the message.", callToAction:"Custom shirts — $10.", voiceoverText:"A deliberately long approved narration that cannot possibly fit within only five seconds of finished generated video.", scenes:[1,2,3,4].map(n=>({description:`scene ${n}`,visualDirection:`visual ${n}`})) };
test("campaign and standalone scripts preview model-aware briefs", () => {
  assert.equal(compilePreviewRenderBrief(script,30,5).visualBeats.length,1);
  assert.equal(compilePreviewRenderBrief(script,30,10).visualBeats.length,2);
  assert.equal(compilePreviewRenderBrief(script,5,10).shortened,false);
  assert.match(compilePreviewRenderBrief(script,30,5).marketingMessage,/\$10/);
  assert.match(compilePreviewRenderBrief(script,30,5).visualProductionBrief,/product.*focal subject/i);
});
