import { Router } from "express";
import { pool } from "@workspace/db";
import { z } from "@workspace/api-zod";
import { resolveUserIdFromToken } from "./auth";
import { getMarketingContext } from "../lib/marketingContext";
import { queueCampaignRun } from "../lib/campaignQueue";
import {
  campaignGenerationContext,
  missingCampaignEvidence,
  missingGenerationEvidence,
  ownedWebsiteImportMatchesCampaign,
  rescuePrefill,
  workspaceMissingCampaignEvidence,
} from "../lib/campaignContext";
import { ownedBusiness, ownedCampaignRun } from "../lib/campaignIdentity";
import {
  attachCampaignVisual,
  deriveProductionBrief,
} from "../lib/campaignAssets";
import {
  approveLatestCampaignRun,
  validateLatestRevisionSource,
} from "../lib/campaignState";
import {
  campaignWorkspaceNextAction,
  campaignWorkspaceProgress,
} from "../lib/campaignWorkspace";
import {
  publicCampaignResult,
  publicCampaignRun,
  canRecoverCampaignRun,
  isCurrentRecoveryRun,
  isFailedRecoveryRun,
  recoveryIdempotencyKey,
  REBUILD_EXPLANATION,
  SOURCE_REPAIR_EXPLANATION,
  repairableRunBehindFailures,
  validateRunSource,
} from "../lib/campaignReview";
const router = Router();
async function reviewAuthority(campaignId: string, userId: string) {
  const campaign = (
    await pool.query(
      `SELECT c.*,b.user_id business_owner_id,b.name business_name,b.website business_website,b.description business_description,b.target_customer business_target_customer,b.products_services business_products_services,b.primary_cta business_primary_cta,wi.id import_id,wi.approved_campaign_id import_approved_campaign_id,wi.user_id import_user_id,wi.business_id import_business_id,wi.source_url import_source_url,wi.content import_content FROM campaigns c JOIN businesses b ON b.id=c.business_id AND b.user_id=c.user_id LEFT JOIN website_import_drafts wi ON wi.id=c.website_import_id WHERE c.id=$1 AND c.user_id=$2`,
      [campaignId, userId],
    )
  ).rows[0];
  if (!campaign) return null;
  const run = (
    await pool.query(
      "SELECT * FROM campaign_runs WHERE campaign_id=$1 ORDER BY run_number DESC LIMIT 1",
      [campaign.id],
    )
  ).rows[0];
  return {
    campaign,
    run,
    valid: Boolean(run && validateRunSource(campaign, run).valid),
  };
}
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
    res
      .status(409)
      .json({
        error: parsed.data.businessId
          ? "Business not found"
          : "Choose which business this campaign belongs to.",
        code: "business_required",
      });
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
      b.name business_name, b.website business_website, b.description business_description,
      b.products_services business_offer, b.products_services business_products_services,
      b.target_customer business_audience, b.target_customer business_target_customer,
      b.primary_cta business_primary_cta,
      bk.personality brand_personality, b.user_id business_owner_id,
      wi.id import_id, wi.approved_campaign_id import_approved_campaign_id, wi.user_id import_user_id, wi.business_id import_business_id, wi.source_url import_source_url,wi.content import_content
     FROM campaigns c JOIN businesses b ON b.id=c.business_id
     LEFT JOIN products p ON p.id=c.product_id AND p.business_id=c.business_id
     LEFT JOIN brand_kits bk ON bk.business_id=c.business_id
     LEFT JOIN website_import_drafts wi ON wi.id=c.website_import_id
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
  const attachedVisuals=(await pool.query(`SELECT TRUE is_primary,mv.id AS version_id,mv.version_number,mv.object_path,mv.status,s.created_at,mp.id AS project_id,p.name FROM campaign_asset_selections s JOIN mockup_versions mv ON mv.id=s.mockup_version_id JOIN mockup_projects mp ON mp.id=s.mockup_project_id AND mp.user_id=s.customer_id AND mp.business_id=s.business_id JOIN products p ON p.id=mp.product_id WHERE s.campaign_id=$1 AND s.customer_id=$2 AND s.active ORDER BY s.created_at DESC`,[campaign.id,userId])).rows;
  const latest = runs[0];
  const rescueMissing = workspaceMissingCampaignEvidence(campaign, latest);
  const latestValidation=latest?validateRunSource(campaign,latest):{valid:true,reason:null,repairable:false};
  const facts = {
    hasBrief: Boolean(campaign.brief?.objective),
    hasStrategy: Boolean(latest?.final_result)&&latestValidation.valid,
    approved: Boolean(campaign.approved_run_id)&&latestValidation.valid,
    visualCount: attachedVisuals.length,
    videoCount: videos.filter((video:any)=>Boolean(video.video_url)).length,
  };
  const publicCampaign={id:campaign.id,business_id:campaign.business_id,product_id:campaign.product_id,name:campaign.name,brief:{objective:campaign.brief?.objective??"",campaignType:campaign.brief?.campaignType??"",channel:campaign.brief?.channel??"",promotion:campaign.brief?.promotion??"",duration:campaign.brief?.duration??""},status:latestValidation.valid?campaign.status:"needs_rebuild",approved_run_id:latestValidation.valid?campaign.approved_run_id:null,product_name:campaign.product_name,product_description:campaign.product_description,product_offer:campaign.product_offer,product_audience:campaign.product_audience,business_name:campaign.business_name,business_offer:campaign.business_offer,business_audience:campaign.business_audience,brand_personality:campaign.brand_personality};
  res.json({
    ...publicCampaign,
    campaign:publicCampaign,
    runs:runs.map((run:any)=>publicCampaignRun(run,validateRunSource(campaign,run).valid)),
    latestRun:latest?publicCampaignRun(latest,latestValidation.valid):null,
    strategy:latestValidation.valid?publicCampaignRun(latest,true).final_result:null,
    visuals,
    attachedVisuals,
    videos,
    rescue: { required: rescueMissing.length > 0, missing: rescueMissing, prefill: rescuePrefill(campaign) },
    progress: campaignWorkspaceProgress(facts),
    nextAction: campaignWorkspaceNextAction(facts),
    reviewState:latestValidation.valid?"valid":"needs_rebuild",
    reviewReason: latestValidation.reason,
    revisionRecovery:
      latest && latestValidation.repairable
        ? { runId: latest.id, reason: latestValidation.reason }
        : null,
    reviewExplanation:latestValidation.valid
      ? null
      : latestValidation.repairable
        ? SOURCE_REPAIR_EXPLANATION
        : REBUILD_EXPLANATION,
  });
});

router.get("/campaigns/:id", async (req, res) => {
  const userId = await owner(req, res);
  if (!userId) return;
  const campaign = await pool.query(
    `SELECT c.*,b.user_id business_owner_id,b.name business_name,b.website business_website,b.description business_description,b.target_customer business_target_customer,b.products_services business_products_services,b.primary_cta business_primary_cta,wi.id import_id,wi.approved_campaign_id import_approved_campaign_id,wi.user_id import_user_id,
     wi.business_id import_business_id,wi.source_url import_source_url,wi.content import_content FROM campaigns c
     JOIN businesses b ON b.id=c.business_id AND b.user_id=c.user_id
     LEFT JOIN website_import_drafts wi ON wi.id=c.website_import_id WHERE c.id=$1 AND c.user_id=$2`,
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
  const attachments = await pool.query(
    `SELECT TRUE is_primary,s.created_at AS attached_at,mv.id AS version_id,mv.version_number,mv.object_path,mv.status,mp.id AS project_id,p.name FROM campaign_asset_selections s JOIN mockup_versions mv ON mv.id=s.mockup_version_id JOIN mockup_projects mp ON mp.id=s.mockup_project_id AND mp.user_id=s.customer_id AND mp.business_id=s.business_id JOIN products p ON p.id=mp.product_id WHERE s.campaign_id=$1 AND s.customer_id=$2 AND s.active ORDER BY s.created_at DESC`,
    [req.params.id, userId],
  );
  const c = campaign.rows[0];
  const latest = runs.rows[0];
  const rescueMissing = workspaceMissingCampaignEvidence(c, latest);
  res.json({
    id: c.id,
    business_id: c.business_id,
    product_id: c.product_id,
    name: c.name,
    brief: {
      objective: c.brief?.objective ?? "",
      campaignType: c.brief?.campaignType ?? "",
      channel: c.brief?.channel ?? "",
      promotion: c.brief?.promotion ?? "",
      duration: c.brief?.duration ?? "",
    },
    status: c.status,
    approved_run_id: c.approved_run_id,
    runs: runs.rows.map((run: any) =>
      publicCampaignRun(run, validateRunSource(c, run).valid),
    ),
    attachedVisuals: attachments.rows,
    rescue: {
      required: rescueMissing.length > 0,
      missing: rescueMissing,
      prefill: rescuePrefill(c),
    },
  });
});

const rescueSchema = z
  .object({
    identity: z.string().trim().min(1).max(200),
    productsServices: z.string().trim().min(1).max(4000),
    targetAudience: z.string().trim().min(1).max(2000),
    offerPromotion: z.string().max(1000).optional(),
    callToAction: z.string().trim().min(1).max(1000),
  })
  .strict();
router.put("/campaigns/:id/rescue", async (req, res) => {
  const userId = await owner(req, res);
  if (!userId) return;
  const parsed = rescueSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({
        error: "Complete the required campaign details.",
        details: parsed.error.flatten(),
      });
    return;
  }
  const rescue = parsed.data;
  const row = await pool.query(
    `UPDATE campaigns SET context_snapshot=jsonb_set(context_snapshot,'{generationContext}',COALESCE(context_snapshot->'generationContext','{}'::jsonb)||$3::jsonb,true),updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *`,
    [
      req.params.id,
      userId,
      JSON.stringify({
        identity: { name: rescue.identity },
        products: [{ name: rescue.productsServices }],
        audienceEvidence: rescue.targetAudience,
        offerEvidence: rescue.offerPromotion || "",
        ctaEvidence: rescue.callToAction,
        rescuedAt: new Date().toISOString(),
      }),
    ],
  );
  if (!row.rows[0]) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  res.json({
    ...row.rows[0],
    rescue: { required: false, prefill: rescuePrefill(row.rows[0]) },
  });
});

router.get("/campaigns/:id/visual-options", async (req, res) => {
  const userId = await owner(req, res);
  if (!userId) return;
  const authority = await reviewAuthority(req.params.id, userId);
  const campaign = authority?.campaign;
  if (
    !authority?.valid ||
    !campaign ||
    campaign.status !== "approved" ||
    !campaign.approved_run_id
  ) {
    res
      .status(409)
      .json({
        error: "Approve this campaign before selecting a visual.",
        requestId: (req as any).id,
      });
    return;
  }
  const rows = await pool.query(
    `SELECT mv.id AS version_id,mv.version_number,mv.object_path,mv.status,mv.created_at,mp.id AS project_id,p.name,EXISTS(SELECT 1 FROM campaign_asset_selections a WHERE a.campaign_id=$1 AND a.campaign_run_id=$3 AND a.mockup_version_id=mv.id AND a.active) AS attached FROM mockup_versions mv JOIN mockup_projects mp ON mp.id=mv.mockup_project_id JOIN products p ON p.id=mp.product_id AND p.business_id=mp.business_id WHERE mp.user_id=$2 AND mp.business_id=$4 AND mv.object_path IS NOT NULL AND mv.status IN ('approved','ready_for_review') ORDER BY mv.created_at DESC`,
    [req.params.id, userId, campaign.approved_run_id, campaign.business_id],
  );
  res.json(rows.rows);
});

router.get("/campaigns/:id/asset-selection", async (req, res) => {
  const userId = await owner(req, res);
  if (!userId) return;
  const row = (
    await pool.query(
      `SELECT s.*,mv.version_number,mv.object_path,mv.status,p.name FROM campaign_asset_selections s JOIN campaigns c ON c.id=s.campaign_id AND c.user_id=s.customer_id JOIN mockup_versions mv ON mv.id=s.mockup_version_id JOIN mockup_projects mp ON mp.id=s.mockup_project_id AND mp.user_id=s.customer_id AND mp.business_id=s.business_id JOIN products p ON p.id=mp.product_id WHERE s.campaign_id=$1 AND s.customer_id=$2 AND s.active ORDER BY s.created_at DESC LIMIT 1`,
      [req.params.id, userId],
    )
  ).rows[0];
  res.json(row ?? null);
});

router.put("/campaigns/:id/asset-selection", async (req, res) => {
  const userId = await owner(req, res);
  if (!userId) return;
  const parsed = z
    .object({ approvedRunId: z.string().uuid(), versionId: z.string().uuid() })
    .strict()
    .safeParse(req.body);
  const key = String(req.headers["idempotency-key"] || "").trim();
  if (!parsed.success || !key || key.length > 200) {
    res
      .status(400)
      .json({
        error:
          "Approved run, visual version, and Idempotency-Key are required.",
        requestId: (req as any).id,
      });
    return;
  }
  const authority = await reviewAuthority(req.params.id, userId);
  if (!authority?.valid) {
    res
      .status(409)
      .json({ error: REBUILD_EXPLANATION, code: "campaign_needs_rebuild" });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await attachCampaignVisual(client, {
      customerId: userId,
      campaignId: req.params.id,
      runId: parsed.data.approvedRunId,
      versionId: parsed.data.versionId,
      idempotencyKey: key,
    });
    if (result.kind !== "selected") {
      await client.query("ROLLBACK");
      res
        .status(result.kind === "campaign_not_approved" ? 409 : 403)
        .json({
          error:
            result.kind === "campaign_not_approved"
              ? "This campaign run is not the approved run."
              : "That visual is unavailable or outside this business.",
          requestId: (req as any).id,
        });
      return;
    }
    await client.query("COMMIT");
    res.json(result);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

router.post("/campaigns/:id/video-brief", async (req, res) => {
  const userId = await owner(req, res);
  if (!userId) return;
  const authority = await reviewAuthority(req.params.id, userId);
  if (!authority?.valid) {
    res
      .status(409)
      .json({ error: REBUILD_EXPLANATION, code: "campaign_needs_rebuild" });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = (
      await client.query(
        `SELECT c.id campaign_id,c.user_id,c.business_id,c.name campaign_name,c.brief campaign_brief,c.source_url,r.id campaign_run_id,r.final_result,r.context_snapshot run_context,s.id selection_id,s.mockup_project_id,s.mockup_version_id FROM campaigns c JOIN campaign_runs r ON r.id=c.approved_run_id AND r.campaign_id=c.id JOIN campaign_asset_selections s ON s.campaign_id=c.id AND s.campaign_run_id=r.id AND s.active JOIN mockup_projects mp ON mp.id=s.mockup_project_id AND mp.user_id=c.user_id AND mp.business_id=c.business_id JOIN mockup_versions mv ON mv.id=s.mockup_version_id AND mv.mockup_project_id=mp.id WHERE c.id=$1 AND c.user_id=$2 AND c.status='approved' FOR UPDATE`,
        [req.params.id, userId],
      )
    ).rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      res
        .status(409)
        .json({
          error: "Confirm an owned visual for the approved campaign first.",
          requestId: (req as any).id,
        });
      return;
    }
    const brief = deriveProductionBrief(row);
    const saved = (
      await client.query(
        `INSERT INTO campaign_video_briefs(id,campaign_id,campaign_run_id,business_id,customer_id,selection_id,mockup_project_id,mockup_version_id,render_intent,brief) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'animate',$9) ON CONFLICT(campaign_id,campaign_run_id) DO UPDATE SET selection_id=EXCLUDED.selection_id,mockup_project_id=EXCLUDED.mockup_project_id,mockup_version_id=EXCLUDED.mockup_version_id,render_intent=EXCLUDED.render_intent,brief=EXCLUDED.brief,updated_at=NOW() RETURNING *`,
        [
          crypto.randomUUID(),
          row.campaign_id,
          row.campaign_run_id,
          row.business_id,
          row.user_id,
          row.selection_id,
          row.mockup_project_id,
          row.mockup_version_id,
          brief,
        ],
      )
    ).rows[0];
    await client.query("COMMIT");
    res.json({ ...saved, brief });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});
router.get("/campaigns/:id/video-brief", async (req, res) => {
  const userId = await owner(req, res);
  if (!userId) return;
  const parsed = z.string().uuid().safeParse(req.query.briefId);
  if (!parsed.success) {
    res
      .status(400)
      .json({
        error: "A valid prepared video brief is required.",
        requestId: (req as any).id,
      });
    return;
  }
  const row = (
    await pool.query(
      `SELECT vb.* FROM campaign_video_briefs vb JOIN campaigns c ON c.id=vb.campaign_id AND c.user_id=vb.customer_id AND c.business_id=vb.business_id AND c.approved_run_id=vb.campaign_run_id AND c.status='approved' JOIN campaign_asset_selections s ON s.id=vb.selection_id AND s.campaign_id=vb.campaign_id AND s.campaign_run_id=vb.campaign_run_id AND s.customer_id=vb.customer_id AND s.business_id=vb.business_id AND s.mockup_project_id=vb.mockup_project_id AND s.mockup_version_id=vb.mockup_version_id AND s.active WHERE vb.campaign_id=$1 AND vb.customer_id=$2 AND vb.id=$3`,
      [req.params.id, userId, parsed.data],
    )
  ).rows[0];
  if (!row) {
    res
      .status(404)
      .json({
        error: "That prepared video handoff is unavailable or stale.",
        requestId: (req as any).id,
      });
    return;
  }
  res.json(row);
});
router.post("/campaigns/:id/rebuild", async (req, res) => {
  const userId = await owner(req, res);
  if (!userId) return;
  const campaign = (
    await pool.query(
      `SELECT c.*,b.user_id business_owner_id,b.name business_name,b.website business_website,b.description business_description,b.target_customer business_target_customer,b.products_services business_products_services,b.primary_cta business_primary_cta,wi.id import_id,wi.approved_campaign_id import_approved_campaign_id,wi.user_id import_user_id,wi.business_id import_business_id,wi.source_url import_source_url,wi.content import_content FROM campaigns c JOIN businesses b ON b.id=c.business_id AND b.user_id=c.user_id LEFT JOIN website_import_drafts wi ON wi.id=c.website_import_id WHERE c.id=$1 AND c.user_id=$2`,
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
  const latest = runs[0];
  const repairSource = repairableRunBehindFailures(campaign, runs);
  if (isFailedRecoveryRun(latest)) {
    if (["queued", "running"].includes(latest.status)) {
      res.json(
        publicCampaignRun(latest, validateRunSource(campaign, latest).valid),
      );
      return;
    }
    if (isCurrentRecoveryRun(latest) && !repairSource) {
      res.status(409).json({
        error:
          "We couldn’t restart this campaign. Please try again later or contact support.",
        code: "campaign_recovery_failed",
      });
      return;
    }
  }
  if (!canRecoverCampaignRun(campaign, latest)) {
    res
      .status(409)
      .json({ error: "This campaign does not require rebuilding." });
    return;
  }
  if (
    campaign.website_import_id &&
    !ownedWebsiteImportMatchesCampaign(campaign)
  ) {
    res.status(409).json({
      error:
        "The approved website information for this campaign is unavailable.",
      code: "campaign_source_unavailable",
    });
    return;
  }
  if (repairSource) {
    const contextSnapshot = campaignGenerationContext(campaign);
    const missingEvidence = missingGenerationEvidence(contextSnapshot);
    if (missingEvidence.length > 0) {
      res.status(409).json({
        error:
          "This campaign is missing confirmed business information. Review the campaign brief before restarting.",
        code: "campaign_evidence_incomplete",
        missing: missingEvidence,
      });
      return;
    }
    const notes =
      "Repair the saved draft using the current confirmed campaign information and resolve every prior Fact Check and QA issue.";
    const priorResult = publicCampaignResult(repairSource.final_result);
    const result = await queueCampaignRun(pool, {
      campaign,
      idempotencyKey: `source-repair:v2:${repairSource.id}:${recoveryIdempotencyKey(campaign, repairSource)}`,
      contextSnapshot: {
        ...contextSnapshot,
        campaignBrief: campaign.brief,
        customerRevision: {
          previousRunId: repairSource.id,
          notes,
          priorQualityFeedback: priorResult
            ? {
                factcheck: priorResult.factcheck,
                qa: priorResult.qa,
              }
            : null,
        },
      },
      revisionNotes: notes,
      sourceRunId: repairSource.id,
      allowFailedSuccessors: repairSource.id !== latest.id,
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
    res
      .status(result.kind === "created" ? 202 : 200)
      .json(publicCampaignRun(result.run, true));
    return;
  }
  const contextSnapshot = campaignGenerationContext(campaign);
  const missingEvidence = missingGenerationEvidence(contextSnapshot);
  if (missingEvidence.length > 0) {
    res.status(409).json({
      error:
        "This campaign is missing confirmed business information. Review the campaign brief before restarting.",
      code: "campaign_evidence_incomplete",
      missing: missingEvidence,
    });
    return;
  }
  const key = recoveryIdempotencyKey(campaign, latest);
  const existing = (
    await pool.query(
      "SELECT * FROM campaign_runs WHERE campaign_id=$1 AND idempotency_key=$2",
      [campaign.id, key],
    )
  ).rows[0];
  if (existing) {
    res.json(
      publicCampaignRun(existing, validateRunSource(campaign, existing).valid),
    );
    return;
  }
  const result = await queueCampaignRun(pool, {
    campaign,
    idempotencyKey: key,
    contextSnapshot,
    revisionNotes: null,
    concurrencyLimit: Math.max(
      1,
      Number(process.env.QUAE_CAMPAIGN_USER_CONCURRENCY || 1),
    ),
  });
  if (result.kind === "conflict") {
    res
      .status(409)
      .json({
        error: "An AI team is already active for this account",
        activeRunId: result.activeRun.id,
      });
    return;
  }
  res
    .status(result.kind === "created" ? 202 : 200)
    .json(publicCampaignRun(result.run, true));
});
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
  const missing = missingCampaignEvidence(campaign);
  if (missing.length) {
    res
      .status(409)
      .json({
        error: "Complete Campaign Rescue before generation.",
        code: "campaign_rescue_required",
        missing,
        prefill: rescuePrefill(campaign),
      });
    return;
  }
  const context =
    campaign.context_snapshot && Object.keys(campaign.context_snapshot).length
      ? campaignGenerationContext(campaign)
      : await getMarketingContext(userId, campaign.product_id ?? undefined);
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
  if (
    !(await ownedCampaignRun(pool, userId, req.params.id, parsed.data.runId))
  ) {
    res.status(404).json({ error: "Not found" });
    return;
  }
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
  const sourceRun = await ownedCampaignRun(
    pool,
    userId,
    req.params.id,
    parsed.data.runId,
  );
  if (!sourceRun) {
    res.status(404).json({ error: "Not found" });
    return;
  }
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
  const missing = missingCampaignEvidence(campaign);
  if (missing.length) {
    res
      .status(409)
      .json({
        error: "Complete Campaign Rescue before regeneration.",
        code: "campaign_rescue_required",
        missing,
        prefill: rescuePrefill(campaign),
      });
    return;
  }
  const context =
    campaign.context_snapshot && Object.keys(campaign.context_snapshot).length
      ? campaignGenerationContext(campaign)
      : await getMarketingContext(userId, campaign.product_id ?? undefined);
  if (!context) {
    res.status(409).json({ error: "Marketing context is incomplete" });
    return;
  }
  const priorResult = publicCampaignResult(sourceRun.final_result);
  const result = await queueCampaignRun(pool, {
    campaign,
    idempotencyKey: parsed.data.idempotencyKey,
    contextSnapshot: {
      ...context,
      campaignBrief: campaign.brief,
      customerRevision: {
        previousRunId: parsed.data.runId,
        notes: parsed.data.notes,
        priorQualityFeedback: priorResult
          ? {
              factcheck: priorResult.factcheck,
              qa: priorResult.qa,
            }
          : null,
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
