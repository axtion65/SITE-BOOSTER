/**
 * Canonical template catalog shared by the API server and all clients.
 *
 * ⚠️  SINGLE SOURCE OF TRUTH
 * ──────────────────────────
 * Adding, renaming, or removing a template here automatically propagates
 * the change to every consumer via TypeScript:
 *   - artifacts/api-server  — serves the list over HTTP
 *   - artifacts/quae        — uses TemplateName / TemplateId in home.tsx
 *
 * Checklist when changing templates:
 *   [ ] Add / rename / remove the entry below
 *   [ ] Fix any TypeScript errors in artifacts/quae/src/pages/home.tsx
 *       (PRODUCT_PRESETS and HOME_TEMPLATES are typed against TemplateName)
 *   [ ] Update TEMPLATE_PHOTOS / TEMPLATE_ACCENT in artifacts/quae/src/pages/templates.tsx
 */

export interface Template {
  id: string;
  name: string;
  category: string;
  platform: string;
  duration: string;
  templateType: string;
  description: string;
  exampleHook: string;
  structure: string[];
  thumbnailGradient: string;
  isPremium: boolean;
}

export const TEMPLATES = [
  {
    id: "tiktok-viral-hook",
    name: "TikTok Viral Hook",
    category: "TikTok Ad",
    platform: "TikTok",
    duration: "15s",
    templateType: "tiktok-viral-hook",
    description: "Pattern-interrupt open that stops the scroll in 1 second. Fast cuts, bold text, algorithm-optimized.",
    exampleHook: "POV: You've been doing this wrong for years…",
    structure: ["Pattern interrupt (0-2s)", "Proof drop (2-10s)", "Hard CTA (10-15s)"],
    thumbnailGradient: "tiktok",
    isPremium: false,
  },
  {
    id: "ugc-review",
    name: "UGC Review",
    category: "UGC Review",
    platform: "TikTok",
    duration: "30s",
    templateType: "ugc-review",
    description: "Authentic first-person review that feels like a real customer, not an ad. Converts 3x better than polished ads.",
    exampleHook: "I was skeptical. Then I tried it for 7 days.",
    structure: ["Skepticism hook", "Discovery moment", "Result reveal + CTA"],
    thumbnailGradient: "ugc",
    isPremium: false,
  },
  {
    id: "before-after",
    name: "Before & After",
    category: "Before & After",
    platform: "Instagram",
    duration: "30s",
    templateType: "before-after",
    description: "Dramatic transformation reveal. Before state pain → after state result. The most shared video format.",
    exampleHook: "This is what 30 days actually looks like.",
    structure: ["Show the problem (before)", "The turning point", "Transformation reveal + CTA"],
    thumbnailGradient: "before-after",
    isPremium: false,
  },
  {
    id: "product-demo",
    name: "Product Demo",
    category: "Trending",
    platform: "YouTube",
    duration: "60s",
    templateType: "product-demo",
    description: "Detailed walkthrough showing the product in real use. Features become benefits. Skeptics become buyers.",
    exampleHook: "Watch this in 60 seconds before you buy anything else.",
    structure: ["Problem established", "Demo in action", "Key features", "Offer + CTA"],
    thumbnailGradient: "demo",
    isPremium: false,
  },
  {
    id: "product-unboxing",
    name: "Product Unboxing",
    category: "Trending",
    platform: "YouTube",
    duration: "60s",
    templateType: "product-unboxing",
    description: "Build anticipation through the reveal sequence. Packaging, first impression, reaction. Pure dopamine.",
    exampleHook: "I've been waiting 3 weeks for this to arrive.",
    structure: ["Anticipation build", "Packaging reveal", "First reaction", "Verdict + CTA"],
    thumbnailGradient: "unboxing",
    isPremium: false,
  },
  {
    id: "flash-sale",
    name: "Flash Sale",
    category: "Shopify Promo",
    platform: "TikTok",
    duration: "15s",
    templateType: "flash-sale",
    description: "Urgency-engineered content that makes viewers act now. Countdown pressure + offer clarity = conversions.",
    exampleHook: "This deal disappears at midnight. Seriously.",
    structure: ["Urgency hook", "Offer reveal", "Countdown CTA"],
    thumbnailGradient: "flash-sale",
    isPremium: false,
  },
  {
    id: "amazon-listing",
    name: "Amazon Listing Video",
    category: "Amazon Listing",
    platform: "Amazon",
    duration: "30s",
    templateType: "amazon-listing",
    description: "Feature-benefit sequential walkthrough. Clean, professional, optimized for Amazon search placement.",
    exampleHook: "The last [product category] you'll ever need to buy.",
    structure: ["Top benefit lead", "Feature showcase", "Comparison edge", "Buy now CTA"],
    thumbnailGradient: "amazon",
    isPremium: false,
  },
  {
    id: "brand-story",
    name: "Brand Story",
    category: "Trending",
    platform: "YouTube",
    duration: "60s",
    templateType: "brand-story",
    description: "Emotional origin story that builds loyalty. Why you exist, who you serve, what you stand for.",
    exampleHook: "We almost quit. Then one customer changed everything.",
    structure: ["Origin moment", "The mission", "Who it's for", "Join us CTA"],
    thumbnailGradient: "brand-story",
    isPremium: true,
  },
  {
    id: "testimonial-compilation",
    name: "Testimonial Stack",
    category: "UGC Review",
    platform: "Instagram",
    duration: "30s",
    templateType: "testimonial-compilation",
    description: "Multiple customer voices stacked for social proof overload. Different faces, same result. Trust at scale.",
    exampleHook: "100+ people tried this. Here's what they said.",
    structure: ["Social proof hook", "Voice 1 → 2 → 3 cuts", "Consensus moment + CTA"],
    thumbnailGradient: "testimonial",
    isPremium: false,
  },
  {
    id: "shopify-promo",
    name: "Shopify Promo",
    category: "Shopify Promo",
    platform: "Instagram",
    duration: "30s",
    templateType: "shopify-promo",
    description: "Lifestyle + offer in one. Drives traffic from scroll to cart. Built for Shopify store conversion.",
    exampleHook: "The product everyone in [city] is obsessed with.",
    structure: ["Lifestyle hook", "Product in context", "Offer reveal", "Shop now CTA"],
    thumbnailGradient: "shopify",
    isPremium: false,
  },
  {
    id: "tutorial",
    name: "Tutorial / How-To",
    category: "Amazon Listing",
    platform: "YouTube",
    duration: "60s",
    templateType: "tutorial",
    description: "Step-by-step educational content that positions your product as the solution. Watch time = trust = sales.",
    exampleHook: "3 steps most people skip — and why it matters.",
    structure: ["Problem + promise", "Step 1 → 2 → 3", "Result proof", "CTA"],
    thumbnailGradient: "tutorial",
    isPremium: false,
  },
  {
    id: "instagram-reel",
    name: "Instagram Reel",
    category: "Trending",
    platform: "Instagram",
    duration: "30s",
    templateType: "instagram-reel",
    description: "Aesthetic-first storytelling for the Explore page. Trend-aware, visually led, designed to go viral.",
    exampleHook: "This is your sign to finally try it.",
    structure: ["Visual hook frame", "Story beats", "Aesthetic product moment", "Save + share CTA"],
    thumbnailGradient: "instagram",
    isPremium: true,
  },
] as const satisfies Template[];

/** Union of every canonical template id, e.g. "tiktok-viral-hook" | "ugc-review" | … */
export type TemplateId = (typeof TEMPLATES)[number]["id"];

/** Union of every canonical template display name, e.g. "TikTok Viral Hook" | "UGC Review" | … */
export type TemplateName = (typeof TEMPLATES)[number]["name"];

/** Union of every canonical template category, e.g. "TikTok Ad" | "UGC Review" | … */
export type TemplateCategory = (typeof TEMPLATES)[number]["category"];

/** Look up a template by its id at compile time (returns the full object type). */
export function getTemplateById(id: TemplateId) {
  return TEMPLATES.find((t) => t.id === id)!;
}
