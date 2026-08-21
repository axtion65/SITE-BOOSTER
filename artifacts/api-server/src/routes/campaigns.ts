import { Router } from "express";
import { pool } from "@workspace/db";
import { z } from "@workspace/api-zod";
import { resolveUserIdFromToken } from "./auth";
import { getMarketingContext } from "../lib/marketingContext";
import { queueCampaignRun } from "../lib/campaignQueue";
import { campaignGenerationContext, missingCampaignEvidence, rescuePrefill } from "../lib/campaignContext";
import { ownedBusiness, ownedCampaignRun } from "../lib/campaignIdentity";
import {
  approveLatestCampaignRun,
  validateLatestRevisionSource,
} from "../lib/campaignState";
import {
  campaignWorkspaceNextAction,
  campaignWorkspaceProgress,
} from "../lib/campaignWorkspace";
const router = Router();
async function owner(req: any, res: any) {
  const id = await resolveUserIdFromToken(req.headers.authorization);
  if (!id) res.status(401).json({ error: "Not authenticated" });
  return id;
}
const campaignBody = z
  .object({
    name: z.string().trim().min(1).max(200),
    businessId: z.string().uuid().optional(),
    productId: z.string().uuid().nullable().optional(),
    brief: z
      .object({
        objective: z.string().trim().min(1).max(2000),
        campaignType: z.string().max(100),
        channel: z.string().max(100),
        promotion: z.string().max(1000).optional(),
        instructions: z.string().max(5000).optional(),
        duration: z.string().max(20).optional(),
      })
      .strict(),
  })
  .strict();
router.get("/campaigns", async (req, res) => {
  const userId = await owner(req, res);
  if (!userId) return;
  const rows = await pool.query(
    "SELECT c.*,r.status AS latest_run_status,r.current_stage,r.qa_status FROM campaigns c LEFT JOIN LATERAL (SELECT * FROM campaign_runs WHERE campaign_id=c.id ORDER BY run_number DESC LIMIT 1) r ON TRUE WHERE c.user_id=$1 ORDER BY c.updated_at DESC",
    [userId],
  );
  res.json(rows.rows);
});
router.post("/campaigns", async (req, res) => {
  const userId = await owner(req, res);
  if (!userId) return;
  const parsed = campaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid campaign brief",
      details: parsed.error.flatten(),
    });
    return;
  }
  const business = await ownedBusiness(pool, userId, parsed.data.businessId);
  if (!business) {
    res.status(409).json({ error: parsed.data.businessId ? "Business not found" : "Choose which business this campaign belongs to.", code: "business_required" });
    return;
  }
  if (parsed.data.productId) {
    const product = await pool.query(
      "SELECT 1 FROM products WHERE id=$1 AND business_id=$2",
      [parsed.data.productId, business.id],
    );
    if (!product.rows[0]) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
  }
  const row = await pool.query(
    "INSERT INTO campaigns(id,user_id,business_id,product_id,name,brief) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
    [
      crypto.randomUUID(),
      userId,
      business.id,
      parsed.data.productId ?? null,
      parsed.data.name,
      parsed.data.brief,
    ],
  );
  res.status(201).json(row.rows[0]);
});
router.get("/campaigns/:id/workspace", async (req, res) => {
  const userId = await owner(req, res);
  if (!userId) return;
  const campaign = (
    await pool.query(
      `SELECT c.*, p.name product_name, p.description product_description,
      p.offer_notes product_offer, p.target_customer product_audience,
      b.name business_name, b.products_services business_offer, b.target_customer business_audience,
      bk.personality brand_personality
     FROM campaigns c JOIN businesses b ON b.id=c.business_id
     LEFT JOIN products p ON p.id=c.product_id AND p.business_id=c.business_id
     LEFT JOIN brand_kits bk ON bk.business_id=c.business_id
     WHERE c.id=$1 AND c.user_id=$2`,
      [req.params.id, userId],
    )
  ).rows[0];
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  const runs = (
    await pool.query(
      "SELECT * FROM campaign_runs WHERE campaign_id=$1 ORDER BY run_number DESC",
      [campaign.id],
    )
  ).rows;
  const visuals = (
    await pool.query(
      `SELECT mp.*, p.name product_name, bm.display_name brand_model_name,
      COALESCE(json_agg(mv ORDER BY mv.version_number DESC) FILTER (WHERE mv.id IS NOT NULL),'[]') versions
     FROM mockup_projects mp JOIN products p ON p.id=mp.product_id
     LEFT JOIN brand_models bm ON bm.id=mp.brand_model_id AND bm.business_id=mp.business_id
     LEFT JOIN mockup_versions mv ON mv.mockup_project_id=mp.id
     WHERE mp.campaign_id=$1 AND mp.user_id=$2 GROUP BY mp.id,p.id,bm.id ORDER BY mp.updated_at DESC`,
      [campaign.id, userId],
    )
  ).rows;
  const videos = (
    await pool.query(
      `SELECT id,title,status,video_url,thumbnail_url,platform,duration,created_at,updated_at
     FROM projects WHERE campaign_id=$1 AND user_id=$2 ORDER BY created_at DESC`,
      [campaign.id, userId],
    )
  ).rows;
  const attachedVisuals=(await pool.query(`SELECT a.is_primary,mv.id AS version_id,mv.version_number,mv.object_path,mv.status,mv.created_at,mp.id AS project_id,p.name FROM campaign_visual_attachments a JOIN mockup_versions mv ON mv.id=a.mockup_version_id JOIN mockup_projects mp ON mp.id=mv.mockup_project_id JOIN products p ON p.id=mp.product_id WHERE a.campaign_id=$1 AND mp.user_id=$2 ORDER BY a.is_primary DESC,a.created_at`,[campaign.id,userId])).rows;
  const latest = runs[0];
  const agents = latest
    ? (
        await pool.query(
          "SELECT role,prompt_version,sequence,status,error_code,completed_at FROM agent_runs WHERE campaign_run_id=$1 ORDER BY sequence",
          [latest.id],
        )
      ).rows
    : [];
  const facts = {
    hasBrief: Boolean(campaign.brief?.objective),
    hasStrategy: Boolean(latest?.final_result),
    approved:
      Boolean(campaign.approved_run_id),
    visualCount: visuals.length,
    videoCount: videos.length,
  };
  res.json({
    ...campaign,
    campaign,
    runs,
    latestRun: latest ?? null,
    agents,
    strategy: latest?.final_result ?? null,
    visuals,
    attachedVisuals,
    videos,
    websiteEvidence: campaign.context_snapshot?.websiteSnapshot ?? null,
    rescue: { required: missingCampaignEvidence(campaign).length > 0, missing: missingCampaignEvidence(campaign), prefill: rescuePrefill(campaign) },
    progress: campaignWorkspaceProgress(facts),
    nextAction: campaignWorkspaceNextAction(facts),
  });
});

router.get("/campaigns/:id", async (req, res) => {
  const userId = await owner(req, res);
  if (!userId) return;
  const campaign = await pool.query(
    "SELECT * FROM campaigns WHERE id=$1 AND user_id=$2",
    [req.params.id, userId],
  );
  if (!campaign.rows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const runs = await pool.query(
    "SELECT * FROM campaign_runs WHERE campaign_id=$1 ORDER BY run_number DESC",
    [req.params.id],
  );
  const agents = runs.rows[0]
    ? await pool.query(
        "SELECT role,prompt_version,sequence,status,error_code,completed_at FROM agent_runs WHERE campaign_run_id=$1 ORDER BY sequence",
        [runs.rows[0].id],
      )
    : { rows: [] };
  const attachments=await pool.query(`SELECT a.is_primary,a.created_at AS attached_at,mv.id AS version_id,mv.version_number,mv.object_path,mv.status,mp.id AS project_id,p.name FROM campaign_visual_attachments a JOIN mockup_versions mv ON mv.id=a.mockup_version_id JOIN mockup_projects mp ON mp.id=mv.mockup_project_id JOIN products p ON p.id=mp.product_id WHERE a.campaign_id=$1 AND mp.user_id=$2 ORDER BY a.is_primary DESC,a.created_at`,[req.params.id,userId]);
  res.json({ ...campaign.rows[0], runs: runs.rows, agents: agents.rows, websiteEvidence:campaign.rows[0].context_snapshot?.websiteSnapshot??null, attachedVisuals:attachments.rows, rescue:{required:missingCampaignEvidence(campaign.rows[0]).length>0,missing:missingCampaignEvidence(campaign.rows[0]),prefill:rescuePrefill(campaign.rows[0])} });
});

const rescueSchema=z.object({identity:z.string().trim().min(1).max(200),productsServices:z.string().trim().min(1).max(4000),targetAudience:z.string().trim().min(1).max(2000),offerPromotion:z.string().max(1000).optional(),callToAction:z.string().trim().min(1).max(1000)}).strict();
router.put("/campaigns/:id/rescue",async(req,res)=>{const userId=await owner(req,res);if(!userId)return;const parsed=rescueSchema.safeParse(req.body);if(!parsed.success){res.status(400).json({error:"Complete the required campaign details.",details:parsed.error.flatten()});return;}const rescue=parsed.data;const row=await pool.query(`UPDATE campaigns SET context_snapshot=jsonb_set(context_snapshot,'{generationContext}',COALESCE(context_snapshot->'generationContext','{}'::jsonb)||$3::jsonb,true),updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *`,[req.params.id,userId,JSON.stringify({identity:{name:rescue.identity},products:[{name:rescue.productsServices}],audienceEvidence:rescue.targetAudience,offerEvidence:rescue.offerPromotion||"",ctaEvidence:rescue.callToAction,rescuedAt:new Date().toISOString()})]);if(!row.rows[0]){res.status(404).json({error:"Campaign not found"});return;}res.json({...row.rows[0],rescue:{required:false,prefill:rescuePrefill(row.rows[0])}});});

router.get("/campaigns/:id/visual-options",async(req,res)=>{const userId=await owner(req,res);if(!userId)return;const campaign=(await pool.query("SELECT 1 FROM campaigns WHERE id=$1 AND user_id=$2",[req.params.id,userId])).rows[0];if(!campaign){res.status(404).json({error:"Campaign not found"});return;}const rows=await pool.query(`SELECT mv.id AS version_id,mv.version_number,mv.object_path,mv.status,mv.created_at,mp.id AS project_id,p.name,EXISTS(SELECT 1 FROM campaign_visual_attachments a WHERE a.campaign_id=$1 AND a.mockup_version_id=mv.id) AS attached FROM mockup_versions mv JOIN mockup_projects mp ON mp.id=mv.mockup_project_id JOIN products p ON p.id=mp.product_id WHERE mp.user_id=$2 AND mv.object_path IS NOT NULL AND mv.status IN ('approved','ready_for_review') ORDER BY mv.created_at DESC`,[req.params.id,userId]);res.json(rows.rows);});
router.put("/campaigns/:id/visuals",async(req,res)=>{const userId=await owner(req,res);if(!userId)return;const parsed=z.object({primaryVersionId:z.string().uuid(),additionalVersionIds:z.array(z.string().uuid()).max(20).default([])}).strict().safeParse(req.body);if(!parsed.success){res.status(400).json({error:"Choose a primary visual."});return;}const ids=[parsed.data.primaryVersionId,...new Set(parsed.data.additionalVersionIds.filter(id=>id!==parsed.data.primaryVersionId))];const client=await pool.connect();try{await client.query("BEGIN");const campaign=(await client.query("SELECT 1 FROM campaigns WHERE id=$1 AND user_id=$2 FOR UPDATE",[req.params.id,userId])).rows[0];if(!campaign){await client.query("ROLLBACK");res.status(404).json({error:"Campaign not found"});return;}const owned=await client.query(`SELECT mv.id FROM mockup_versions mv JOIN mockup_projects mp ON mp.id=mv.mockup_project_id WHERE mv.id=ANY($1::text[]) AND mp.user_id=$2 AND mv.object_path IS NOT NULL AND mv.status IN ('approved','ready_for_review')`,[ids,userId]);if(owned.rows.length!==ids.length){await client.query("ROLLBACK");res.status(403).json({error:"One or more visuals are not selectable or are not owned by your account."});return;}await client.query("DELETE FROM campaign_visual_attachments WHERE campaign_id=$1 AND NOT(mockup_version_id=ANY($2::text[]))",[req.params.id,ids]);await client.query("UPDATE campaign_visual_attachments SET is_primary=FALSE WHERE campaign_id=$1",[req.params.id]);for(const id of ids)await client.query(`INSERT INTO campaign_visual_attachments(campaign_id,mockup_version_id,is_primary) VALUES($1,$2,$3) ON CONFLICT(campaign_id,mockup_version_id) DO UPDATE SET is_primary=EXCLUDED.is_primary`,[req.params.id,id,id===parsed.data.primaryVersionId]);await client.query("COMMIT");res.json({campaignId:req.params.id,primaryVersionId:parsed.data.primaryVersionId,additionalVersionIds:ids.slice(1)});}catch(error){await client.query("ROLLBACK").catch(()=>{});throw error;}finally{client.release();}});
router.post("/campaigns/:id/run-team", async (req, res) => {
  const userId = await owner(req, res);
  if (!userId) return;
  const key = String(
    req.headers["idempotency-key"] || req.body?.idempotencyKey || "",
  ).trim();
  if (!key || key.length > 200) {
    res.status(400).json({ error: "Idempotency-Key is required" });
    return;
  }
  const campaign = (
    await pool.query("SELECT * FROM campaigns WHERE id=$1 AND user_id=$2", [
      req.params.id,
      userId,
    ])
  ).rows[0];
  if (!campaign) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const missing=missingCampaignEvidence(campaign);if(missing.length){res.status(409).json({error:"Complete Campaign Rescue before generation.",code:"campaign_rescue_required",missing,prefill:rescuePrefill(campaign)});return;}
  const context = campaign.context_snapshot&&Object.keys(campaign.context_snapshot).length?campaignGenerationContext(campaign):await getMarketingContext(userId,campaign.product_id??undefined);
  if (!context) {
    res.status(409).json({ error: "Marketing context is incomplete" });
    return;
  }
  const result = await queueCampaignRun(pool, {
    campaign,
    idempotencyKey: key,
    contextSnapshot: { ...context, campaignBrief: campaign.brief },
    concurrencyLimit: Math.max(
      1,
      Number(process.env.QUAE_CAMPAIGN_USER_CONCURRENCY || 1),
    ),
  });
  if (result.kind === "conflict") {
    res.status(409).json({
      error: "An AI team is already active for this account",
      activeRunId: result.activeRun.id,
    });
    return;
  }
  res.status(202).json(result.run);
});
router.post("/campaigns/:id/approve", async (req, res) => {
  const userId = await owner(req, res);
  if (!userId) return;
  const parsed = z.object({ runId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid approval" });
    return;
  }
  if (!await ownedCampaignRun(pool, userId, req.params.id, parsed.data.runId)) { res.status(404).json({ error: "Not found" }); return; }
  const result = await approveLatestCampaignRun(pool, {
    campaignId: req.params.id,
    userId,
    runId: parsed.data.runId,
  });
  if (result.kind === "not_found") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (result.kind === "superseded") {
    res
      .status(409)
      .json({ error: "This campaign version has been superseded" });
    return;
  }
  res.json(result.campaign);
});

router.post("/campaigns/:id/request-changes", async (req, res) => {
  const userId = await owner(req, res);
  if (!userId) return;
  const parsed = z
    .object({
      runId: z.string().uuid(),
      notes: z.string().trim().min(1).max(5000),
      idempotencyKey: z.string().min(1).max(200),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Revision guidance is required" });
    return;
  }
  if (!await ownedCampaignRun(pool, userId, req.params.id, parsed.data.runId)) { res.status(404).json({ error: "Not found" }); return; }
  const current = await validateLatestRevisionSource(pool, {
    campaignId: req.params.id,
    userId,
    runId: parsed.data.runId,
  });
  if (current.kind === "not_found") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (current.kind === "superseded") {
    res
      .status(409)
      .json({ error: "This campaign version has been superseded" });
    return;
  }
  const campaign = (
    await pool.query(
      "SELECT c.* FROM campaigns c JOIN campaign_runs r ON r.campaign_id=c.id WHERE c.id=$1 AND c.user_id=$2 AND r.id=$3",
      [req.params.id, userId, parsed.data.runId],
    )
  ).rows[0];
  if (!campaign) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const missing=missingCampaignEvidence(campaign);if(missing.length){res.status(409).json({error:"Complete Campaign Rescue before regeneration.",code:"campaign_rescue_required",missing,prefill:rescuePrefill(campaign)});return;}
  const context = campaign.context_snapshot&&Object.keys(campaign.context_snapshot).length?campaignGenerationContext(campaign):await getMarketingContext(userId,campaign.product_id??undefined);
  if (!context) {
    res.status(409).json({ error: "Marketing context is incomplete" });
    return;
  }
  const result = await queueCampaignRun(pool, {
    campaign,
    idempotencyKey: parsed.data.idempotencyKey,
    contextSnapshot: {
      ...context,
      campaignBrief: campaign.brief,
      customerRevision: {
        previousRunId: parsed.data.runId,
        notes: parsed.data.notes,
      },
    },
    revisionNotes: parsed.data.notes,
    sourceRunId: parsed.data.runId,
    concurrencyLimit: Math.max(
      1,
      Number(process.env.QUAE_CAMPAIGN_USER_CONCURRENCY || 1),
    ),
  });
  if (result.kind === "superseded") {
    res
      .status(409)
      .json({ error: "This campaign version has been superseded" });
    return;
  }
  if (result.kind === "conflict") {
    res.status(409).json({
      error: "An AI team is already active for this account",
      activeRunId: result.activeRun.id,
    });
    return;
  }
  res.status(202).json(result.run);
});
export default router;
