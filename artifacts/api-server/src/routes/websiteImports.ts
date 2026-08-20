import { Router } from "express";
import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import { z } from "@workspace/api-zod";
import { resolveUserIdFromToken } from "./auth";
import { downloadWebsiteImage, importWebsite, WebsiteImportError } from "../lib/websiteImporter";
import { logger } from "../lib/logger";
import { ObjectStorageService } from "../lib/objectStorage";

const router=Router();
async function owner(req:any,res:any){const id=await resolveUserIdFromToken(req.headers.authorization);if(!id)res.status(401).json({error:"Not authenticated"});return id;}
const attempts=new Map<string,number[]>();
function rateLimited(userId:string){const now=Date.now(), recent=(attempts.get(userId)||[]).filter(x=>now-x<60_000);recent.push(now);attempts.set(userId,recent);return recent.length>5;}
const startSchema=z.object({url:z.string().trim().min(1).max(2048),authorized:z.literal(true),idempotencyKey:z.string().trim().min(8).max(200)}).strict();
const productSchema=z.object({name:z.string().trim().min(1).max(200),description:z.string().max(4000),images:z.array(z.string().url()).max(10),regularPrice:z.string().max(30).nullable(),salePrice:z.string().max(30).nullable(),currency:z.string().max(3).nullable(),offer:z.string().max(1000).nullable(),url:z.string().url().nullable(),selected:z.boolean()}).strict();
const contentSchema=z.object({business:z.object({name:z.string().trim().min(1).max(200),website:z.string().url(),description:z.string().max(4000),pageTitle:z.string().max(500),pageDescription:z.string().max(2000),logo:z.string().url().nullable(),favicon:z.string().url().nullable(),colors:z.array(z.string().regex(/^#[0-9A-Fa-f]{6}$/)).max(3),socialLinks:z.record(z.string(),z.string().url())}).strict(),products:z.array(productSchema).max(50),structured:z.object({organizations:z.array(z.unknown()),products:z.array(z.unknown())})}).strict();
const approveSchema=z.object({approved:z.literal(true),content:contentSchema,campaign:z.object({name:z.string().trim().min(1).max(200),objective:z.string().trim().min(1).max(2000),campaignType:z.string().max(100).default("Awareness"),channel:z.string().max(100).default("Multi-platform"),promotion:z.string().max(1000).optional()}).strict()}).strict();
const friendly:Record<string,string>={invalid_target:"Enter a valid public HTTP or HTTPS website URL.",blocked_target:"This website address cannot be imported.",target_unavailable:"We couldn’t read that website. Check the URL and try again.",redirect_limit:"The website redirected too many times.",unsupported_content:"That address does not contain a supported public web page.",response_too_large:"That web page is too large to import safely."};

type ApprovedContent=z.infer<typeof contentSchema>;
async function archiveApprovedImages(userId:string,importId:string,content:ApprovedContent){
  const storage=new ObjectStorageService();
  const ownedProductImages=new Map<number,string[]>();
  const jobs:Array<{url:string;assetKey:string;productIndex?:number;imageIndex?:number}>=[];
  const key=(prefix:string,url:string)=>`${prefix}-${createHash("sha256").update(url).digest("hex").slice(0,16)}`;
  if(content.business.logo)jobs.push({url:content.business.logo,assetKey:key("brand-logo",content.business.logo)});
  content.products.forEach((product,productIndex)=>{if(product.selected)product.images.forEach((url,imageIndex)=>jobs.push({url,assetKey:key(`product-${productIndex}-image-${imageIndex}`,url),productIndex,imageIndex}));});
  let next=0,skipped=0,logoObjectPath:string|null=null;
  const workers=Array.from({length:Math.min(4,jobs.length)},async()=>{
    while(next<jobs.length){
      const job=jobs[next++];if(!job)return;
      try{
        const image=await downloadWebsiteImage(job.url);
        const saved=await storage.uploadWebsiteImportImage(image.buffer,{userId,importId,assetKey:job.assetKey},image.contentType);
        if(job.productIndex===undefined)logoObjectPath=saved.objectPath;
        else{const paths=ownedProductImages.get(job.productIndex)||[];paths[job.imageIndex!]=saved.objectPath;ownedProductImages.set(job.productIndex,paths);}
      }catch(error){
        skipped++;
        logger.warn({event:"website_import_asset_skipped",importId,userId,assetKey:job.assetKey,code:error instanceof WebsiteImportError?error.code:"asset_storage_failed"},"Website import asset was not persisted");
      }
    }
  });
  await Promise.all(workers);
  return {logoObjectPath,ownedProductImages,skipped};
}

router.post('/website-imports',async(req,res)=>{const userId=await owner(req,res);if(!userId)return;if(rateLimited(userId)){res.status(429).json({error:"Too many import attempts. Please wait and try again."});return;}const parsed=startSchema.safeParse(req.body);if(!parsed.success){res.status(400).json({error:"A valid URL, authorization confirmation, and import key are required."});return;}
  const existing=await pool.query("SELECT * FROM website_import_drafts WHERE user_id=$1 AND idempotency_key=$2",[userId,parsed.data.idempotencyKey]);if(existing.rows[0]){res.json(existing.rows[0]);return;}const importId=crypto.randomUUID();try{const content=await importWebsite(parsed.data.url);const row=await pool.query("INSERT INTO website_import_drafts(id,user_id,idempotency_key,source_url,content) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,idempotency_key) DO UPDATE SET updated_at=website_import_drafts.updated_at RETURNING *",[importId,userId,parsed.data.idempotencyKey,parsed.data.url,content]);logger.info({importId,userId},"Website import draft prepared");res.status(201).json(row.rows[0]);}catch(error){const code=error instanceof WebsiteImportError?error.code:'target_unavailable';logger.warn({importId,userId,code},"Website import rejected");res.status(400).json({error:friendly[code]||friendly.target_unavailable});}});
router.get('/website-imports/:id',async(req,res)=>{const userId=await owner(req,res);if(!userId)return;const row=await pool.query("SELECT * FROM website_import_drafts WHERE id=$1 AND user_id=$2",[req.params.id,userId]);if(!row.rows[0]){res.status(404).json({error:"Import not found"});return;}res.json(row.rows[0]);});
router.post('/website-imports/:id/approve',async(req,res)=>{
  const userId=await owner(req,res);if(!userId)return;
  const parsed=approveSchema.safeParse(req.body);if(!parsed.success){res.status(400).json({error:"Review and explicitly approve the imported information."});return;}
  const existing=(await pool.query("SELECT status,approved_campaign_id FROM website_import_drafts WHERE id=$1 AND user_id=$2",[req.params.id,userId])).rows[0];
  if(!existing){res.status(404).json({error:"Import not found"});return;}
  if(existing.status==='approved'){res.json({campaignId:existing.approved_campaign_id,idempotent:true});return;}

  // Remote source URLs remain draft metadata. Only these private object paths
  // are allowed to cross the approval boundary into customer records.
  const archived=await archiveApprovedImages(userId,req.params.id,parsed.data.content);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const draft=(await client.query("SELECT * FROM website_import_drafts WHERE id=$1 AND user_id=$2 FOR UPDATE",[req.params.id,userId])).rows[0];
    if(!draft){await client.query('ROLLBACK');res.status(404).json({error:"Import not found"});return;}
    if(draft.status==='approved'){await client.query('COMMIT');res.json({campaignId:draft.approved_campaign_id,idempotent:true});return;}
    const c=parsed.data.content;
    let business=(await client.query("SELECT * FROM businesses WHERE user_id=$1",[userId])).rows[0];
    if(!business){business=(await client.query("INSERT INTO businesses(id,user_id,name,description,website,social_links) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[crypto.randomUUID(),userId,c.business.name,c.business.description||null,c.business.website,c.business.socialLinks])).rows[0];}
    else{business=(await client.query("UPDATE businesses SET name=COALESCE(NULLIF(name,''),$2),description=COALESCE(description,$3),website=COALESCE(website,$4),social_links=CASE WHEN social_links='{}'::jsonb THEN $5 ELSE social_links END,updated_at=NOW() WHERE id=$1 RETURNING *",[business.id,c.business.name,c.business.description||null,c.business.website,c.business.socialLinks])).rows[0];}
    const colors=c.business.colors;
    await client.query("INSERT INTO brand_kits(id,business_id,logo_object_path,primary_color,secondary_color,accent_color) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(business_id) DO UPDATE SET logo_object_path=COALESCE(brand_kits.logo_object_path,EXCLUDED.logo_object_path),primary_color=COALESCE(brand_kits.primary_color,EXCLUDED.primary_color),secondary_color=COALESCE(brand_kits.secondary_color,EXCLUDED.secondary_color),accent_color=COALESCE(brand_kits.accent_color,EXCLUDED.accent_color),updated_at=NOW()",[crypto.randomUUID(),business.id,archived.logoObjectPath,colors[0]||null,colors[1]||null,colors[2]||null]);
    let firstProductId:null|string=null;
    for(const [productIndex,p] of c.products.entries()){
      if(!p.selected)continue;
      const id=crypto.randomUUID();
      await client.query("INSERT INTO products(id,business_id,name,type,description,regular_price,sale_price,currency,product_url,offer_notes) VALUES($1,$2,$3,'product',$4,$5,$6,$7,$8,$9)",[id,business.id,p.name,p.description||null,p.regularPrice,p.salePrice,p.currency,p.url,p.offer]);
      firstProductId??=id;
      for(const [imageIndex,objectPath] of (archived.ownedProductImages.get(productIndex)||[]).filter(Boolean).entries())await client.query("INSERT INTO product_images(id,product_id,object_path,role,sort_order) VALUES($1,$2,$3,$4,$5) ON CONFLICT(object_path) DO NOTHING",[crypto.randomUUID(),id,objectPath,imageIndex===0?'primary':'reference',imageIndex]);
    }
    const campaignId=crypto.randomUUID();
    await client.query("INSERT INTO campaigns(id,user_id,business_id,product_id,name,brief) VALUES($1,$2,$3,$4,$5,$6)",[campaignId,userId,business.id,firstProductId,parsed.data.campaign.name,{objective:parsed.data.campaign.objective,campaignType:parsed.data.campaign.campaignType,channel:parsed.data.campaign.channel,promotion:parsed.data.campaign.promotion||'',instructions:`Website profile approved from ${c.business.website}`}]);
    await client.query("UPDATE website_import_drafts SET status='approved',content=$2,approved_campaign_id=$3,approved_at=NOW(),updated_at=NOW() WHERE id=$1",[draft.id,c,campaignId]);
    await client.query('COMMIT');
    logger.info({event:"website_import_approved",importId:draft.id,userId,campaignId,skippedAssets:archived.skipped},"Website import approved");
    res.json({campaignId,assetWarnings:archived.skipped});
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
});
export default router;
