import assert from "node:assert/strict";
import test from "node:test";
import { customerCopy } from "./customer-copy";

test("structured campaign copy renders only customer-facing fields",()=>assert.deepEqual(customerCopy({finalScript:{title:"Launch",hook:"Meet Quae",script:"Build your campaign.",callToAction:"Start now",evidenceIds:["fact_1"],model:"internal"}}),{title:"Launch",hook:"Meet Quae",body:"Build your campaign.",callToAction:"Start now"}));
test("raw JSON and metadata cannot become marketing copy",()=>{assert.equal(customerCopy('{"evidenceIds":["fact_1"]}'),null);assert.equal(JSON.stringify(customerCopy({finalScript:{evidenceIds:["fact_1"],model:"x"}})).includes("fact_1"),false)});
