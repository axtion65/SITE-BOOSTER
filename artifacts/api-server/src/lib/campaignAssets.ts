export type CampaignAssetDb={query(sql:string,values?:unknown[]):Promise<{rows:any[]}>};

export async function attachCampaignVisual(db:CampaignAssetDb,input:{customerId:string;campaignId:string;runId:string;versionId:string;idempotencyKey:string}){
  const campaign=(await db.query(`SELECT c.* FROM campaigns c JOIN businesses b ON b.id=c.business_id AND b.user_id=c.user_id JOIN campaign_runs r ON r.id=c.approved_run_id AND r.campaign_id=c.id WHERE c.id=$1 AND c.user_id=$2 AND c.approved_run_id=$3 AND c.status='approved' FOR UPDATE`,[input.campaignId,input.customerId,input.runId])).rows[0];
  if(!campaign)return {kind:"campaign_not_approved" as const};
  const visual=(await db.query(`SELECT mv.id version_id,mv.version_number,mv.object_path,mv.status,mp.id project_id,mp.business_id,p.name FROM mockup_versions mv JOIN mockup_projects mp ON mp.id=mv.mockup_project_id JOIN products p ON p.id=mp.product_id AND p.business_id=mp.business_id WHERE mv.id=$1 AND mp.user_id=$2 AND mp.business_id=$3 AND mv.object_path IS NOT NULL AND mv.status IN ('approved','ready_for_review')`,[input.versionId,input.customerId,campaign.business_id])).rows[0];
  if(!visual)return {kind:"visual_not_owned" as const};
  const existing=(await db.query("SELECT * FROM campaign_asset_selections WHERE campaign_id=$1 AND campaign_run_id=$2 AND idempotency_key=$3",[input.campaignId,input.runId,input.idempotencyKey])).rows[0];
  if(existing)return {kind:"selected" as const,selection:existing,visual};
  await db.query("UPDATE campaign_asset_selections SET active=FALSE,replaced_at=NOW() WHERE campaign_id=$1 AND campaign_run_id=$2 AND active",[input.campaignId,input.runId]);
  const selection=(await db.query(`INSERT INTO campaign_asset_selections(id,campaign_id,campaign_run_id,business_id,customer_id,mockup_project_id,mockup_version_id,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[crypto.randomUUID(),input.campaignId,input.runId,campaign.business_id,input.customerId,visual.project_id,visual.version_id,input.idempotencyKey])).rows[0];
  await db.query("UPDATE campaign_video_briefs SET selection_id=$3,mockup_project_id=$4,mockup_version_id=$5,brief=jsonb_set(jsonb_set(brief,'{selectedVisualProjectId}',to_jsonb($4::text),true),'{selectedVisualVersionId}',to_jsonb($5::text),true),updated_at=NOW() WHERE campaign_id=$1 AND campaign_run_id=$2",[input.campaignId,input.runId,selection.id,visual.project_id,visual.version_id]);
  return {kind:"selected" as const,selection,visual};
}

export function deriveProductionBrief(row:any){
  const result=row.final_result||{},context=row.run_context||{},brief=row.campaign_brief||{};
  const copy=result.winningScript||result.script||result.copy||{};
  return {customerId:row.user_id,businessId:row.business_id,campaignId:row.campaign_id,approvedCampaignRunId:row.campaign_run_id,selectedVisualProjectId:row.mockup_project_id,selectedVisualVersionId:row.mockup_version_id,campaignName:row.campaign_name,strategy:result.strategy||result.campaignStrategy||result,approvedCopy:copy.script||copy.body||copy.voiceoverText||"",targetAudience:context.audienceEvidence||brief.targetAudience||"",offer:context.offerEvidence||brief.promotion||"",cta:context.ctaEvidence||copy.callToAction||"",platform:brief.channel||"",duration:brief.duration||result.estimatedDuration||"30s",sourceWebsiteUrl:row.source_url||null,renderIntent:"animate" as const};
}
