export const PLAN_SLUGS = ["free", "starter", "pro", "agency"] as const;
export type PlanSlug = (typeof PLAN_SLUGS)[number];
export type PaidPlanSlug = Exclude<PlanSlug, "free">;
export type BillingInterval = "month" | "year";

export type RenderIntent = "create_new" | "animate";
export interface RenderingModelDefinition {
  id: string; name: string; description: string; nativeDurationSeconds: number;
  creditCost: number; tier: PlanSlug; badge?: string;
  supports: Readonly<{ textToVideo: boolean; imageToVideo: boolean }>;
  capabilities: readonly string[];
}

/** The single capability catalogue consumed by both the API and customer UI. */
export const RENDERING_MODELS = [
  { id:"ltx-fast", name:"Business Ad — LTX 2.3 Fast", description:"A complete multi-scene advert with voiceover, captions, branding, and CTA.", nativeDurationSeconds:10, creditCost:180, tier:"free", badge:"Best Value", supports:{textToVideo:true,imageToVideo:true}, capabilities:["15–45 second advert","Multi-scene story","Voiceover + captions","1080p export"] },
  { id:"kling", name:"Premium Ad — Kling 3", description:"A higher-fidelity multi-scene advert assembled to the approved script.", nativeDurationSeconds:10, creditCost:390, tier:"pro", badge:"Premium", supports:{textToVideo:true,imageToVideo:true}, capabilities:["15–45 second advert","Premium scene quality","Voiceover + captions","1080p export"] },
] as const satisfies readonly RenderingModelDefinition[];
export const RENDERING_MODEL_BY_ID = Object.fromEntries(RENDERING_MODELS.map(model => [model.id, model])) as Record<string, RenderingModelDefinition>;

export const PRODUCTION_VIDEO_DURATIONS = ["15s", "30s", "45s"] as const;

/** Maximum provider scene length. Customer output is assembled from several scenes. */
export function nativeClipLength(modelId: string): string | null {
  const model = RENDERING_MODEL_BY_ID[modelId];
  return model ? `${model.nativeDurationSeconds}s` : null;
}

/** Migrate legacy draft choices while leaving every other draft field untouched. */
export function normalizeClipLength(modelId: string, _legacyDuration?: string | null): string {
  if (!RENDERING_MODEL_BY_ID[modelId]) return "30s";
  return PRODUCTION_VIDEO_DURATIONS.includes(_legacyDuration as (typeof PRODUCTION_VIDEO_DURATIONS)[number])
    ? _legacyDuration!
    : "30s";
}

export function isNativeClipLength(modelId: string, duration?: string | null): boolean {
  return Boolean(RENDERING_MODEL_BY_ID[modelId]) && PRODUCTION_VIDEO_DURATIONS.includes(duration as (typeof PRODUCTION_VIDEO_DURATIONS)[number]);
}

export function getProductionCreditCost(modelId: string, duration?: string | null): number {
  const seconds = Number.parseInt(normalizeClipLength(modelId, duration), 10);
  if (modelId === "kling") return seconds * 13;
  return seconds * 6;
}

export interface PlanDefinition {
  slug: PlanSlug;
  name: string;
  description: string;
  monthlyPriceCents: number;
  annualPriceCents: number;
  credits: number;
  videos: string;
  features: readonly string[];
  cta: string;
  mostPopular: boolean;
}

const annualPrice = (monthlyPriceCents: number) => Math.round(monthlyPriceCents * 12 * 0.8);

export const PLAN_CATALOG = [
  {
    slug: "free",
    name: "Free",
    description: "Try it out",
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    credits: 90,
    videos: "1 complete 15s advert",
    features: ["90 production credits", "15-second LTX advert", "Voiceover + captions", "1080p export"],
    cta: "Start Free",
    mostPopular: false,
  },
  {
    slug: "starter",
    name: "Starter",
    description: "Solo creators & small brands",
    monthlyPriceCents: 2300,
    annualPriceCents: annualPrice(2300),
    credits: 600,
    videos: "3 complete 30s adverts",
    features: ["600 credits/month", "LTX 2.3 multi-scene adverts", "All platforms", "1080p export", "Priority support"],
    cta: "Get Starter",
    mostPopular: false,
  },
  {
    slug: "pro",
    name: "Pro",
    description: "Growing brands & teams",
    monthlyPriceCents: 4900,
    annualPriceCents: annualPrice(4900),
    credits: 2000,
    videos: "11 LTX or 5 Kling 30s adverts",
    features: ["2,000 credits/month", "LTX 2.3 + Kling 3", "All platforms", "1080p export", "Priority rendering", "Video history"],
    cta: "Get Pro",
    mostPopular: true,
  },
  {
    slug: "agency",
    name: "Agency",
    description: "Agencies & high-volume teams",
    monthlyPriceCents: 9900,
    annualPriceCents: annualPrice(9900),
    credits: 6000,
    videos: "33 LTX or 15 Kling 30s adverts",
    features: ["6,000 credits/month", "LTX 2.3 + Kling 3", "All platforms", "1080p export", "Fastest rendering", "Team workspace", "API access"],
    cta: "Get Agency",
    mostPopular: false,
  },
] as const satisfies readonly PlanDefinition[];

export const PAID_PLANS = PLAN_CATALOG.filter(
  (plan): plan is (typeof PLAN_CATALOG)[number] & { slug: PaidPlanSlug } => plan.slug !== "free",
);

export const PLAN_BY_SLUG = Object.fromEntries(PLAN_CATALOG.map(plan => [plan.slug, plan])) as Record<
  PlanSlug,
  (typeof PLAN_CATALOG)[number]
>;

export const PLAN_CREDITS: Readonly<Record<PlanSlug, number>> = Object.fromEntries(
  PLAN_CATALOG.map(plan => [plan.slug, plan.credits]),
) as Record<PlanSlug, number>;

export function isPlanSlug(value: string): value is PlanSlug {
  return PLAN_SLUGS.includes(value as PlanSlug);
}

export function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
