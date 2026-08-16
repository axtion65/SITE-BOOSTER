import { hostname } from "node:os";
import { fal } from "@fal-ai/client";
import { pool } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";
import { buildFalImageInput, buildGenerationBrief, chooseAspectRatio, PRIMARY_IMAGE_ENGINE, visualQa } from "./mockupProduction";
import { logger } from "./logger";

const workerId=`${hostname()}:${process.pid}:${crypto.randomUUID()}`;
let timer:NodeJS.Timeout|undefined;
let busy=false;

type Job={id:string;status:string;mockup_project_id:string;provider_job_ref?:string;provider_output_url?:string;provider_output_content_type?:string;provider_output_width?:number;provider_output_height?:number};

async function claimJob():Promise<Job|null>{
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const found=await client.query(`
      SELECT mv.* FROM mockup_versions mv
      WHERE mv.status IN ('queued','provider_processing','saving_asset')
        AND (mv.lease_expires_at IS NULL OR mv.lease_expires_at < NOW())
      ORDER BY mv.queued_at NULLS LAST, mv.created_at
      FOR UPDATE SKIP LOCKED LIMIT 1
    `);
    if(!found.rows[0]){await client.query("COMMIT");return null}
    await client.query(`UPDATE mockup_versions SET lease_owner=$2,lease_expires_at=NOW()+INTERVAL '90 seconds',attempt_count=attempt_count+1 WHERE id=$1`,[found.rows[0].id,workerId]);
    await client.query("COMMIT");
    return found.rows[0];
  }catch(error){await client.query("ROLLBACK").catch(()=>{});throw error}finally{client.release()}
}

async function contextFor(job:Job){
  const row=(await pool.query(`
    SELECT mv.*,mp.user_id,mp.business_id,mp.creation_path,mp.creative_direction,
      p.name product_name,p.category,p.target_customer,
      b.industry,b.target_customer business_target_customer,
      bk.personality,bm.display_name brand_model_name,bm.reference_object_paths brand_model_refs,
      c.brief campaign_brief,c.brief->>'channel' campaign_channel
    FROM mockup_versions mv
    JOIN mockup_projects mp ON mp.id=mv.mockup_project_id
    JOIN products p ON p.id=mp.product_id
    JOIN businesses b ON b.id=mp.business_id
    LEFT JOIN brand_kits bk ON bk.business_id=b.id
    LEFT JOIN brand_models bm ON bm.id=mp.brand_model_id AND bm.business_id=mp.business_id
    LEFT JOIN campaigns c ON c.id=mp.campaign_id AND c.user_id=mp.user_id
    WHERE mv.id=$1
  `,[job.id])).rows[0];
  if(!row)throw new Error("mockup_job_context_missing");
  return row;
}

async function submit(job:Job){
  const row=await contextFor(job);
  const storage=new ObjectStorageService();
  const refs:string[]=row.product_reference_paths||[];
  const allRefs=[...refs,...(row.brand_model_refs||[])];
  const referenceUrls=await Promise.all(allRefs.map((path:string)=>storage.getSignedObjectEntityUrl(path.replace(/^\\/api\\/storage/,""),900)));
  const brief=buildGenerationBrief({
    style:row.creation_path,
    product:{name:row.product_name,category:row.category,target_customer:row.target_customer},
    business:{industry:row.industry,target_customer:row.business_target_customer},
    brandKit:{personality:row.personality},
    campaign:row.campaign_brief,
    brandModel:row.brand_model_name?{name:row.brand_model_name}:null,
    sceneDirection:row.creative_direction?.sceneDirection,
    revision:row.revision_request,
  });
  await pool.query("UPDATE mockup_versions SET status='provider_submitting',job_stage='provider_submitting',generation_brief=$2,lease_expires_at=NOW()+INTERVAL '90 seconds' WHERE id=$1",[job.id,brief]);
  const input=buildFalImageInput({style:row.creation_path,productReferencePaths:refs,brandModelReferencePaths:row.brand_model_refs||[],creativeDirection:brief,aspectRatio:chooseAspectRatio(row.creation_path,row.campaign_channel)},referenceUrls);
  const submitted:any=await (fal as any).queue.submit(PRIMARY_IMAGE_ENGINE,{input});
  const requestId=String(submitted?.request_id||submitted?.requestId||"");
  if(!requestId)throw new Error("provider_submission_missing_request_id");
  await pool.query(`UPDATE mockup_versions SET status='provider_processing',job_stage='provider_processing',provider_job_ref=$2,provider_model=$3,lease_owner=NULL,lease_expires_at=NULL WHERE id=$1`,[job.id,requestId,PRIMARY_IMAGE_ENGINE]);
  logger.info({event:"mockup_provider_submitted",versionId:job.id,providerJobRef:requestId});
}

async function pollProvider(job:Job){
  if(!job.provider_job_ref)throw new Error("provider_job_reference_missing");
  const status:any=await (fal as any).queue.status(PRIMARY_IMAGE_ENGINE,{requestId:job.provider_job_ref,logs:false});
  const state=String(status?.status||"").toUpperCase();
  if(state==="IN_QUEUE"||state==="IN_PROGRESS"){
    await pool.query("UPDATE mockup_versions SET lease_owner=NULL,lease_expires_at=NULL WHERE id=$1",[job.id]);
    return;
  }
  if(state!=="COMPLETED")throw new Error(`provider_job_${state.toLowerCase()||"unknown"}`);
  const result:any=await (fal as any).queue.result(PRIMARY_IMAGE_ENGINE,{requestId:job.provider_job_ref});
  const data=result?.data??result;
  const image=data?.images?.[0]??data?.image;
  if(!image?.url)throw new Error("provider_completed_without_image");
  await pool.query(`UPDATE mockup_versions SET status='saving_asset',job_stage='saving_asset',
    provider_output_url=$2,provider_output_content_type=$3,provider_output_width=$4,provider_output_height=$5,
    lease_owner=NULL,lease_expires_at=NULL WHERE id=$1`,
    [job.id,image.url,image.content_type||"image/png",Number(image.width||0),Number(image.height||0)]);
}

async function saveAsset(job:Job){
  if(!job.provider_output_url)throw new Error("provider_output_missing");
  const row=await contextFor(job);
  const storage=new ObjectStorageService();
  const saved=await storage.uploadMockupImageFromUrl(job.provider_output_url,{userId:row.user_id,businessId:row.business_id,mockupId:row.mockup_project_id,versionId:job.id},job.provider_output_content_type||"image/png");
  const qa=visualQa({objectPath:saved.objectPath,contentType:saved.contentType,width:Number(job.provider_output_width||0),height:Number(job.provider_output_height||0),owned:true,productReferenceCount:(row.product_reference_paths||[]).length,completed:true});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    await client.query(`UPDATE mockup_versions SET object_path=$2,status=$3,job_stage=$3,qa_decision=$3,qa_checks=$4,width=$5,height=$6,content_type=$7,lease_owner=NULL,lease_expires_at=NULL WHERE id=$1`,
      [job.id,saved.objectPath,qa.decision,JSON.stringify(qa.checks),job.provider_output_width,job.provider_output_height,saved.contentType]);
    await client.query("UPDATE mockup_projects SET status=$2,updated_at=NOW() WHERE id=$1",[job.mockup_project_id,qa.decision]);
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK").catch(()=>{});throw error}finally{client.release()}
  logger.info({event:"mockup_version_created",mockupId:job.mockup_project_id,versionId:job.id,qaDecision:qa.decision});
}

async function fail(job:Job,error:unknown){
  const uncertain=job.status==="queued"||job.status==="provider_submitting";
  const code=uncertain?"provider_submission_uncertain":`mockup_${job.status}_failed`;
  await pool.query("UPDATE mockup_versions SET status='failed',job_stage='failed',failure_code=$2,lease_owner=NULL,lease_expires_at=NULL WHERE id=$1",[job.id,code]).catch(()=>{});
  await pool.query("UPDATE mockup_projects SET status='failed',updated_at=NOW() WHERE id=$1",[job.mockup_project_id]).catch(()=>{});
  logger.error({event:"mockup_job_failed",versionId:job.id,mockupId:job.mockup_project_id,stage:job.status,failureCode:code,error:error instanceof Error?error.message:"unknown"});
}

export async function workMockupOnce(){
  if(busy)return;busy=true;
  try{
    const job=await claimJob();if(!job)return;
    try{
      if(job.status==="queued")await submit(job);
      else if(job.status==="provider_processing")await pollProvider(job);
      else if(job.status==="saving_asset")await saveAsset(job);
    }catch(error){await fail(job,error)}
  }finally{busy=false}
}

export function startMockupWorker(){
  if(timer)return;
  fal.config({credentials:process.env.FAL_KEY!.trim()});
  timer=setInterval(()=>void workMockupOnce(),2_000);timer.unref();void workMockupOnce();
}
