import { TEMPLATES } from "@workspace/templates";
import { isPlanSlug, type BillingInterval, type PaidPlanSlug } from "@workspace/plans";

export const CAMPAIGN_TEMPLATE_PRESETS = [
  {
    slug: "product-launch",
    title: "Product Launch",
    homepageDescription:
      "Introduce a product with a clear story, launch message, creative direction, and channel plan.",
    campaignType: "Launch",
    channel: "Multi-platform",
    objective:
      "Introduce a new product and turn awareness into customer interest and sales.",
    instructions:
      "Build a coordinated launch story with clear positioning, launch messaging, creative direction, and a channel plan.",
    duration: "30 seconds",
  },
  {
    slug: "seasonal-sale",
    title: "Seasonal Sale",
    homepageDescription:
      "Coordinate a timely offer across social, video, product visuals, and print touchpoints.",
    campaignType: "Seasonal",
    channel: "Multi-platform",
    objective: "Drive timely sales with a coordinated seasonal promotion.",
    instructions:
      "Create urgency appropriate to the season and keep the offer consistent across social, video, product visuals, and print.",
    duration: "30 seconds",
  },
  {
    slug: "local-business-promotion",
    title: "Local Business Promotion",
    homepageDescription:
      "Turn a local goal into relevant messaging, creative, and recommended community channels.",
    campaignType: "Awareness",
    channel: "Facebook",
    objective:
      "Increase awareness and visits among customers in the local community.",
    instructions:
      "Emphasize local relevance, trust, and a clear reason to visit, while recommending suitable community channels.",
    duration: "30 seconds",
  },
  {
    slug: "social-media-growth",
    title: "Social Media Growth",
    homepageDescription:
      "Build a repeatable social campaign with content themes, hooks, captions, and video direction.",
    campaignType: "Awareness",
    channel: "Instagram",
    objective:
      "Grow an engaged social audience with useful, repeatable content.",
    instructions:
      "Develop repeatable content themes, strong hooks, captions, and short-form video direction that encourage follows and engagement.",
    duration: "15 seconds",
  },
  {
    slug: "new-customer-offer",
    title: "New Customer Offer",
    homepageDescription:
      "Package an introductory offer with persuasive copy, creative concepts, and follow-up content.",
    campaignType: "Promotion",
    channel: "Email",
    objective:
      "Convert first-time buyers with a clear and credible introductory offer.",
    instructions:
      "Explain the value for a new customer with persuasive copy, creative concepts, and useful follow-up content. Leave the offer details for the customer to add.",
    duration: "30 seconds",
  },
  {
    slug: "print-social-campaign",
    title: "Print + Social Campaign",
    homepageDescription:
      "Keep physical and digital marketing aligned with one strategy and consistent message.",
    campaignType: "Promotion",
    channel: "Multi-platform",
    objective:
      "Reach customers through a consistent campaign across print and social touchpoints.",
    instructions:
      "Use one strategy and message across physical and digital marketing, adapting calls to action to each touchpoint.",
    duration: "30 seconds",
  },
  {
    slug: "ecommerce-product-campaign",
    title: "E-commerce Product Campaign",
    homepageDescription:
      "Create a product-led campaign for storefront, social, email, and promotional video.",
    campaignType: "Promotion",
    channel: "Multi-platform",
    objective:
      "Drive qualified traffic and product sales across e-commerce channels.",
    instructions:
      "Build a product-led campaign for the storefront, social, email, and promotional video with consistent benefits and calls to action.",
    duration: "30 seconds",
  },
] as const;

export type CampaignTemplatePreset = (typeof CAMPAIGN_TEMPLATE_PRESETS)[number];
export type CampaignTemplateSlug = CampaignTemplatePreset["slug"];

export function getCampaignTemplate(
  value: string | null | undefined,
): CampaignTemplatePreset | undefined {
  return CAMPAIGN_TEMPLATE_PRESETS.find((preset) => preset.slug === value);
}

export function campaignTemplateUrl(
  slug: CampaignTemplateSlug,
  signedIn: boolean,
) {
  return signedIn
    ? `/studio/campaigns?template=${slug}`
    : `/signin?campaignTemplate=${slug}`;
}

export function campaignBuilderUrl(signedIn: boolean) {
  return signedIn ? "/studio/campaigns" : "/signin?campaignBuilder=1";
}

export function billingPlanUrl(
  plan: PaidPlanSlug,
  interval: BillingInterval,
  signedIn: boolean,
) {
  return signedIn
    ? `/studio/billing?plan=${plan}&interval=${interval}`
    : `/signin?billingPlan=${plan}&billingInterval=${interval}`;
}

type VideoTemplateIntent = {
  id: string;
  name: string;
  templateType?: string;
  platform: string;
  duration: string;
  description: string;
  exampleHook?: string;
  structure?: readonly string[];
};

function videoTemplateStudioUrl(template: VideoTemplateIntent) {
  const params = new URLSearchParams({
    templateId: template.id,
    templateName: template.name,
    templateType: template.templateType ?? template.id,
    platform: template.platform.toLowerCase(),
    duration: template.duration,
    templateDesc: template.description,
  });
  if (template.exampleHook) params.set("exampleHook", template.exampleHook);
  if (template.structure?.length) {
    params.set("structure", JSON.stringify(template.structure));
  }
  return `/studio?${params.toString()}`;
}

export function videoTemplateUrl(template: VideoTemplateIntent, signedIn: boolean) {
  return signedIn
    ? videoTemplateStudioUrl(template)
    : `/signin?videoTemplate=${encodeURIComponent(template.id)}`;
}

export function authenticationDestination(search: string) {
  const params = new URLSearchParams(search);
  const preset = getCampaignTemplate(params.get("campaignTemplate"));
  if (preset) return `/studio/campaigns?template=${preset.slug}`;
  const videoTemplate = TEMPLATES.find(
    ({ id }) => id === params.get("videoTemplate"),
  );
  if (videoTemplate) return videoTemplateStudioUrl(videoTemplate);
  const billingPlan = params.get("billingPlan");
  const billingInterval = params.get("billingInterval");
  if (
    billingPlan &&
    isPlanSlug(billingPlan) &&
    billingPlan !== "free" &&
    (billingInterval === "month" || billingInterval === "year")
  ) {
    return billingPlanUrl(billingPlan, billingInterval, true);
  }
  if (params.get("campaignBuilder") === "1") return "/studio/campaigns";
  return "/studio";
}

export function campaignFormForTemplate(preset?: CampaignTemplatePreset) {
  return {
    name: preset?.title ?? "",
    productId: "",
    objective: preset?.objective ?? "",
    campaignType: preset?.campaignType ?? "Launch",
    channel: preset?.channel ?? "Instagram",
    promotion: "",
    instructions: preset?.instructions ?? "",
    duration: preset?.duration ?? "30 seconds",
  };
}
