export const AGENT_PRICING_VERSION="2026-08-13.v1";
type Rates={input:number;output:number;cached:number};
function configured(model:string):Rates|undefined{const key=model.toUpperCase().replace(/[^A-Z0-9]/g,"_");const input=Number(process.env[`QUAE_AGENT_PRICE_${key}_INPUT_MILLION`]),output=Number(process.env[`QUAE_AGENT_PRICE_${key}_OUTPUT_MILLION`]),cached=Number(process.env[`QUAE_AGENT_PRICE_${key}_CACHED_MILLION`]);return[input,output,cached].every(Number.isFinite)?{input,output,cached}:undefined;}
export function estimatedCost(model:string,u:{inputTokens:number;outputTokens:number;cachedTokens:number}){const r=configured(model);if(!r)return null;return ((u.inputTokens-u.cachedTokens)*r.input+u.cachedTokens*r.cached+u.outputTokens*r.output)/1_000_000;}
