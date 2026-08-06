export const PLAN_SLUGS = ["free", "starter", "pro", "agency"] as const;
export type PlanSlug = (typeof PLAN_SLUGS)[number];
export type PaidPlanSlug = Exclude<PlanSlug, "free">;
export type BillingInterval = "month" | "year";

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
    videos: "3 videos",
    features: ["3 AI videos (Ovi)", "All 12 templates", "TikTok, Reels, Shorts", "720p export"],
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
    videos: "~20 Ovi or 3 Wan videos",
    features: ["600 credits/month", "Ovi + Wan 2.5 models", "All platforms", "1080p export", "Priority support"],
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
    videos: "~66 Ovi or 6 Kling videos",
    features: ["2,000 credits/month", "All models + Kling 2.5", "All platforms", "4K export", "Priority rendering", "Video history"],
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
    videos: "~200 Ovi or 4 Veo 3 videos",
    features: ["6,000 credits/month", "All models + Veo 3", "All platforms", "4K export", "Fastest rendering", "Team workspace", "API access"],
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
