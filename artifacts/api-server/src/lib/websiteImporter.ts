import { lookup as nodeLookup } from "node:dns/promises";
import { isIP } from "node:net";

export type ImportedProduct = { name: string; description: string; images: string[]; regularPrice: string | null; salePrice: string | null; currency: string | null; offer: string | null; url: string | null; selected: boolean };
export type WebsiteImportContent = { business: { name: string; website: string; description: string; pageTitle: string; pageDescription: string; logo: string | null; favicon: string | null; colors: string[]; socialLinks: Record<string,string> }; products: ImportedProduct[]; structured: { organizations: unknown[]; products: unknown[] } };
export class WebsiteImportError extends Error { constructor(public code: string) { super(code); } }
type Lookup = (host: string) => Promise<{ address: string }[]>;
type Fetch = (input: string, init: RequestInit) => Promise<Response>;
const MAX_HTML = 2_000_000, MAX_REDIRECTS = 4, TIMEOUT_MS = 8_000;

function publicAddress(address: string) {
  const normalized = address.toLowerCase().replace(/^::ffff:/, "");
  if (isIP(normalized) === 4) {
    const [a,b] = normalized.split(".").map(Number);
    return !(a===0 || a===10 || a===127 || a>=224 || (a===169&&b===254) || (a===172&&b>=16&&b<=31) || (a===192&&b===168) || (a===100&&b>=64&&b<=127));
  }
  if (isIP(normalized) === 6) return !(normalized==="::" || normalized==="::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb"));
  return false;
}
export async function validatePublicUrl(raw: string, lookup: Lookup = async h => nodeLookup(h,{all:true})) {
  let url: URL; try { url = new URL(raw); } catch { throw new WebsiteImportError("invalid_target"); }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || !url.hostname || (url.port && !['80','443'].includes(url.port))) throw new WebsiteImportError("invalid_target");
  const host = url.hostname.toLowerCase().replace(/\.$/,"");
  if (host==='localhost' || host.endsWith('.localhost') || host==='metadata.google.internal') throw new WebsiteImportError("blocked_target");
  const addresses = isIP(host) ? [{address:host}] : await lookup(host).catch(()=>[]);
  if (!addresses.length || addresses.some(x=>!publicAddress(x.address))) throw new WebsiteImportError("blocked_target");
  url.hash=''; return url;
}
const clean = (v: unknown, max=4000) => String(v ?? '').replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const attr = (html:string, pattern:RegExp) => clean(html.match(pattern)?.[1] ?? '');
const absolute = (value:unknown, base:URL) => { try { const u=new URL(String(value),base); return ['http:','https:'].includes(u.protocol)?u.href:null; } catch{return null;} };
function jsonLd(html:string) { const values:unknown[]=[]; for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){ try { const x=JSON.parse(m[1]); values.push(...(Array.isArray(x)?x:[x])); } catch {} } return values.flatMap((x:any)=>Array.isArray(x?.['@graph'])?x['@graph']:[x]); }
function typeIs(x:any,t:string){const v=x?.['@type'];return Array.isArray(v)?v.includes(t):v===t;}
export function extractWebsite(html:string, url:URL):WebsiteImportContent {
  const structured=jsonLd(html), organizations=structured.filter(x=>typeIs(x,'Organization')), rawProducts=structured.filter(x=>typeIs(x,'Product')) as any[];
  const title=attr(html,/<title[^>]*>([\s\S]*?)<\/title>/i), description=attr(html,/<meta\b[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']*)/i)||attr(html,/<meta\b[^>]*content=["']([^"']*)["'][^>]*(?:name|property)=["'](?:description|og:description)["']/i);
  const org:any=organizations[0]||{}; const name=clean(org.name)||attr(html,/<meta\b[^>]*property=["']og:site_name["'][^>]*content=["']([^"']*)/i)||title.split(/[|–—-]/)[0].trim();
  const links=[...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map(m=>absolute(m[1],url)).filter(Boolean) as string[];
  const socials:Record<string,string>={}; for(const link of links){for(const host of ['instagram.com','facebook.com','linkedin.com','tiktok.com','youtube.com','x.com']) if(new URL(link).hostname.replace(/^www\./,'').endsWith(host)) socials[host.split('.')[0]]=link;}
  const logo=absolute(org.logo?.url||org.logo||attr(html,/<(?:meta|link)\b[^>]*(?:property=["']og:image["']|rel=["'][^"']*apple-touch-icon[^"']*["'])[^>]*(?:content|href)=["']([^"']+)/i),url);
  const favicon=absolute(attr(html,/<link\b[^>]*rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)/i),url)||new URL('/favicon.ico',url).href;
  const colors=[...new Set([...html.matchAll(/(?:theme-color[^>]*content=["']|(?:--[\w-]*color|(?:background-)?color)\s*:\s*)(#[0-9a-f]{6})/gi)].map(m=>m[1].toUpperCase()))].slice(0,3);
  const products=rawProducts.slice(0,50).map(p=>{const offers=Array.isArray(p.offers)?p.offers[0]:p.offers||{}; const images=(Array.isArray(p.image)?p.image:[p.image]).map((x:any)=>absolute(x?.url||x,url)).filter(Boolean).slice(0,10); return {name:clean(p.name,200),description:clean(p.description),images,regularPrice:offers.highPrice?clean(offers.highPrice,30):offers.price?clean(offers.price,30):null,salePrice:offers.lowPrice?clean(offers.lowPrice,30):null,currency:offers.priceCurrency?clean(offers.priceCurrency,3).toUpperCase():null,offer:clean(offers.description)||null,url:absolute(p.url||offers.url,url),selected:true};}).filter(p=>p.name);
  return {business:{name:name||url.hostname,website:url.href,description:clean(org.description)||description,pageTitle:title,pageDescription:description,logo,favicon,colors,socialLinks:socials},products,structured:{organizations,products:rawProducts}};
}
export async function importWebsite(raw:string, deps:{fetch?:Fetch;lookup?:Lookup}={}):Promise<WebsiteImportContent>{
  let url=await validatePublicUrl(raw,deps.lookup), redirects=0; const fetcher=deps.fetch||globalThis.fetch;
  while(true){ const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),TIMEOUT_MS); let response:Response; try{response=await fetcher(url.href,{redirect:'manual',signal:controller.signal,headers:{Accept:'text/html,application/xhtml+xml','User-Agent':'QuaeWebsiteImporter/1.0'}});}catch{throw new WebsiteImportError('target_unavailable');}finally{clearTimeout(timer);}
    if(response.status>=300&&response.status<400){if(++redirects>MAX_REDIRECTS)throw new WebsiteImportError('redirect_limit');const location=response.headers.get('location');if(!location)throw new WebsiteImportError('target_unavailable');url=await validatePublicUrl(new URL(location,url).href,deps.lookup);continue;}
    if(!response.ok)throw new WebsiteImportError('target_unavailable'); const type=(response.headers.get('content-type')||'').split(';')[0];if(!['text/html','application/xhtml+xml'].includes(type))throw new WebsiteImportError('unsupported_content');const declared=Number(response.headers.get('content-length')||0);if(declared>MAX_HTML)throw new WebsiteImportError('response_too_large');const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.byteLength>MAX_HTML)throw new WebsiteImportError('response_too_large');return extractWebsite(new TextDecoder().decode(bytes),url);
  }
}
