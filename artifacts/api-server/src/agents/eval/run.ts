import { readFile } from "node:fs/promises";
if(process.env.QUAE_AGENT_EVAL_LIVE!=="1") throw new Error("Live agent eval is disabled. Set QUAE_AGENT_EVAL_LIVE=1 explicitly; this command never runs in CI.");
const fixtures=JSON.parse(await readFile(new URL("./fixtures/campaigns.json",import.meta.url),"utf8"));
console.log(JSON.stringify({status:"ready",fixtures:fixtures.length,metrics:["strategy quality","hook quality","persuasion","brand adherence","specificity","claim safety","script quality","judge agreement","latency","token usage","estimated cost"],note:"Benchmark output is for human review and never changes production models automatically."},null,2));
