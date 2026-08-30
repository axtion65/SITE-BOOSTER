export type CampaignContextRecord = {
  context_snapshot?: any;
  brief?: any;
  [key: string]: any;
};

const present = (value: unknown) =>
  Array.isArray(value)
    ? value.length > 0
    : String(value ?? "").trim().length > 0;

export function ownedWebsiteImportMatchesCampaign(campaign: any) {
  return Boolean(
    campaign?.website_import_id &&
      campaign.import_id === campaign.website_import_id &&
      campaign.import_user_id === campaign.user_id &&
      (campaign.import_business_id === campaign.business_id ||
        campaign.import_approved_campaign_id === campaign.id) &&
      campaign.import_source_url === campaign.source_url &&
      campaign.import_content &&
      typeof campaign.import_content === "object",
  );
}

function importProducts(content: any) {
  return Array.isArray(content?.products)
    ? content.products
        .filter(
          (product: any) =>
            product &&
            typeof product === "object" &&
            product.name &&
            product.selected !== false,
        )
        .map((product: any) => ({
          ...product,
          price: product.price ?? product.regularPrice ?? null,
        }))
    : [];
}

export function campaignGenerationContext(campaign: CampaignContextRecord) {
  const snapshot =
    campaign.context_snapshot &&
    typeof campaign.context_snapshot === "object" &&
    !Array.isArray(campaign.context_snapshot)
      ? campaign.context_snapshot
      : {};
  const selected =
    snapshot.generationContext &&
    typeof snapshot.generationContext === "object"
      ? snapshot.generationContext
      : snapshot;
  const approvedImport = ownedWebsiteImportMatchesCampaign(campaign)
    ? campaign.import_content
    : null;
  const importedProducts = importProducts(approvedImport);
  const savedIdentity = {
    name: campaign.business_name ?? "",
    website: campaign.business_website ?? "",
    description: campaign.business_description ?? "",
  };
  const importedIdentity = approvedImport?.business
    ? {
        name: approvedImport.business.name ?? "",
        website: approvedImport.business.website ?? campaign.import_source_url,
        description: approvedImport.business.description ?? "",
      }
    : null;
  const fallbackIdentity =
    campaign.identity_resolution === "saved"
      ? savedIdentity
      : importedIdentity ?? savedIdentity;
  const businessProducts = present(
    campaign.business_products_services ?? campaign.business_offer,
  )
    ? [
        {
          name:
            campaign.business_products_services ?? campaign.business_offer,
        },
      ]
    : [];
  const products = present(selected.products)
    ? selected.products
    : present(importedProducts)
      ? importedProducts
      : businessProducts;
  const productOffers = products
    .map((product: any) => product?.offer)
    .filter((offer: unknown) => present(offer))
    .join("; ");

  return {
    ...selected,
    identity: present(selected.identity?.name)
      ? selected.identity
      : fallbackIdentity,
    products,
    audienceEvidence: present(selected.audienceEvidence)
      ? selected.audienceEvidence
      : (campaign.business_target_customer ??
        campaign.business_audience ??
        campaign.brief?.audience ??
        ""),
    offerEvidence: present(selected.offerEvidence)
      ? selected.offerEvidence
      : (campaign.brief?.promotion ?? productOffers),
    ctaEvidence: present(selected.ctaEvidence)
      ? selected.ctaEvidence
      : (campaign.business_primary_cta ?? ""),
    websiteEvidence: snapshot.websiteSnapshot ?? approvedImport,
    sourceUrl:
      snapshot.sourceUrl ??
      campaign.import_source_url ??
      campaign.source_url ??
      null,
    campaignBrief: campaign.brief,
  };
}

export function missingGenerationEvidence(context: any): string[] {
  const missing: string[] = [];
  if (!present(context?.identity?.name)) missing.push("identity");
  if (!Array.isArray(context?.products) || context.products.length === 0)
    missing.push("products");
  if (!present(context?.audienceEvidence)) missing.push("audience");
  if (!present(context?.ctaEvidence)) missing.push("cta");
  return missing;
}

export function missingCampaignEvidence(
  campaign: CampaignContextRecord,
): string[] {
  return missingGenerationEvidence(campaignGenerationContext(campaign));
}

export function rescuePrefill(campaign: CampaignContextRecord) {
  const context = campaignGenerationContext(campaign);
  return {
    identity: context.identity?.name ?? "",
    productsServices: (context.products ?? [])
      .map((product: any) => product.name)
      .filter(Boolean)
      .join(", "),
    targetAudience: context.audienceEvidence ?? "",
    offerPromotion: context.offerEvidence ?? "",
    callToAction: context.ctaEvidence ?? "",
  };
}
