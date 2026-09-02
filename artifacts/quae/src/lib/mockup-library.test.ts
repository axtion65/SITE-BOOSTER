import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { downloadMockupVersion, studioMockupUrl, type MockupDownloadRuntime } from "./mockup-library.js";

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

test("download stays on the authenticated API origin",async()=>{
  const link={href:"",download:"",clicked:false,click(){this.clicked=true;}};
  let revoked="";
  let requestUrl="";
  let requestHeaders:HeadersInit|undefined;
  const runtime:MockupDownloadRuntime={
    async fetch(input,init){
      requestUrl=String(input);
      requestHeaders=init?.headers;
      return new Response(new Blob(["saved-image"],{type:"image/png"}),{status:200});
    },
    headers:()=>({Authorization:"Bearer customer-token"}),
    createObjectUrl:()=>"blob:customer-visual",
    revokeObjectUrl:url=>{revoked=url;},
    createLink:()=>link,
  };

  await downloadMockupVersion({id:"version-2",version_number:2,object_path:"/objects/mockups/customer/result.png",status:"ready"},"Easter Bug",runtime);

  assert.equal(requestUrl,"/api/storage/objects/mockups/customer/result.png");
  assert.deepEqual(requestHeaders,{Authorization:"Bearer customer-token"});
  assert.equal(link.href,"blob:customer-visual");
  assert.equal(link.download,"easter-bug-v2");
  assert.equal(link.clicked,true);
  assert.equal(revoked,"blob:customer-visual");
});

test("download failure never creates a customer file",async()=>{
  let created=false;
  const runtime:MockupDownloadRuntime={
    fetch:async()=>new Response(null,{status:403}),
    headers:()=>({Authorization:"Bearer customer-token"}),
    createObjectUrl:()=>{created=true;return "blob:unexpected";},
    revokeObjectUrl:()=>undefined,
    createLink:()=>({href:"",download:"",click:()=>undefined}),
  };

  await assert.rejects(
    downloadMockupVersion({id:"version-1",version_number:1,object_path:"/objects/mockups/customer/private.png",status:"ready"},"Private Visual",runtime),
    /image could not be downloaded/,
  );
  assert.equal(created,false);
});

test("missing or unauthorized projects show a safe message",()=>{
  assert.match(studio,/It may not exist or belong to this account/);
});

test("legacy missing-dimension visual can be approved and returned to its campaign",()=>{
  assert.match(studio,/recoverableDimensionMetadata/);
  assert.match(studio,/Approve visual/);
  assert.match(studio,/project\?\.approved_run_id/);
  assert.match(studio,/Use in Campaign/);
});
