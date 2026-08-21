import assert from "node:assert/strict";
import test from "node:test";
import { ownedBusiness, ownedCampaign, ownedCampaignRun } from "./campaignIdentity";

const rows=(items:any[])=>({query:async()=>({rows:items})});
test("an explicit business is always checked against the authenticated owner",async()=>{let seen:any[]=[];const db={query:async(sql:string,values?:unknown[])=>{seen=[sql,values];return {rows:[]}}};assert.equal(await ownedBusiness(db,"customer-a","business-b"),null);assert.match(seen[0],/id=\$1 AND user_id=\$2/);assert.deepEqual(seen[1],["business-b","customer-a"])});
test("multiple businesses never resolve by row order",async()=>assert.equal(await ownedBusiness(rows([{id:"big-al"},{id:"quae"}]),"owner"),null));
test("a sole owned business remains compatible with existing customers",async()=>assert.equal((await ownedBusiness(rows([{id:"quae"}]),"owner"))?.id,"quae"));
test("campaign identity joins user and business and accepts an optional business guard",async()=>{let query="",values:unknown[]=[];await ownedCampaign({query:async(s,v)=>{query=s;values=v||[];return {rows:[]}}},"customer","campaign","business");assert.match(query,/b\.user_id=c\.user_id/);assert.match(query,/c\.business_id=\$3/);assert.deepEqual(values,["campaign","customer","business"])});
test("campaign runs are guarded by run, campaign, customer, and business ownership",async()=>{let query="";await ownedCampaignRun({query:async(s)=>{query=s;return {rows:[]}}},"customer","campaign","run");for(const guard of [/r\.id=\$1/,/r\.campaign_id=\$2/,/c\.user_id=\$3/,/b\.user_id=c\.user_id/])assert.match(query,guard)});
