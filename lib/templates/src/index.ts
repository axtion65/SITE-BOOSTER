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
    description: "Pattern-interrupt opening for fast short-form storytelling. Quick cuts, bold text, and a clear call to action.",
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
    description: "First-person review structure that feels direct and conversational. Lead with a real reaction, show the experience, then close with a clear CTA.",
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
    description: "Problem-to-result structure built around strong visual contrast. Show the starting point, the turning point, and the outcome.",
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
    description: "Detailed walkthrough showing the product in real use. Connect key features to practical customer benefits.",
    exampleHook: "See how this works in 60 seconds.",
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
    description: "Build anticipation through the reveal sequence: packaging, first impression, product details, and a clear closing takeaway.",
    exampleHook: "I've been waiting for this to arrive. Let's open it.",
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
    description: "Short offer-led structure that makes the deadline and value easy to understand. Use real offer dates and terms.",
    exampleHook: "This offer ends at midnight.",
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
    description: "Clean feature-benefit walkthrough for marketplace and product-detail content.",
    exampleHook: "Here's what to know before choosing this product.",
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
    description: "Emotional origin story focused on why your business exists, who you serve, and what you stand for.",
    exampleHook: "Here's why we started this business.",
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
    description: "Combine verified customer voices into one concise proof-focused narrative. Use only testimonials you have permission to publish.",
    exampleHook: "Here's what customers told us about this product.",
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
    description: "Lifestyle-led product promo with a clear ecommerce call to action. Show the product in context, then present the offer.",
    exampleHook: "Here's how this product fits into a busy day.",
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
    description: "Step-by-step educational structure that teaches a useful process while showing where your product fits.",
    exampleHook: "3 steps to get started — and what to check along the way.",
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
    description: "Short vertical format built around a strong visual opening, concise story beats, and a clear CTA.",
    exampleHook: "Here's a quick look at how it works.",
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
