export type CampaignContextRecord = { context_snapshot?: any; brief?: any };

export function campaignGenerationContext(campaign: CampaignContextRecord) {
  const snapshot = campaign.context_snapshot ?? {};
  const selected = snapshot.generationContext ?? snapshot;
  return { ...selected, websiteEvidence: snapshot.websiteSnapshot, sourceUrl: snapshot.sourceUrl, campaignBrief: campaign.brief };
}

export function missingCampaignEvidence(campaign: CampaignContextRecord): string[] {
  if (!(campaign.context_snapshot?.source === "website_import" || campaign.context_snapshot?.sourceUrl)) return [];
  const context = campaignGenerationContext(campaign);
  const missing: string[] = [];
  if (!context.identity?.name) missing.push("identity");
  if (!Array.isArray(context.products) || context.products.length === 0) missing.push("products");
  if (!String(context.audienceEvidence ?? "").trim()) missing.push("audience");
  if (!String(context.ctaEvidence ?? "").trim()) missing.push("cta");
  return missing;
}

export function rescuePrefill(campaign: CampaignContextRecord) {
  const context = campaignGenerationContext(campaign);
  return { identity: context.identity?.name ?? "", productsServices: (context.products ?? []).map((p:any)=>p.name).filter(Boolean).join(", "), targetAudience: context.audienceEvidence ?? "", offerPromotion: context.offerEvidence ?? "", callToAction: context.ctaEvidence ?? "" };
}
