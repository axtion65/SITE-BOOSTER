/**
 * Re-exports the shared template catalog and provides a typed name-lookup
 * object for use in home.tsx (PRODUCT_PRESETS and HOME_TEMPLATES).
 *
 * ⚠️  SINGLE SOURCE OF TRUTH
 * ──────────────────────────
 * Template data lives in lib/templates/src/index.ts.
 * To add, rename, or remove a template:
 *   1. Edit lib/templates/src/index.ts
 *   2. Update TEMPLATE_NAMES below to match
 *   3. TypeScript errors in home.tsx will point to every usage that needs
 *      updating (PRODUCT_PRESETS and HOME_TEMPLATES are typed against TemplateName)
 *
 * See lib/templates/src/index.ts for the full checklist.
 */

export { TEMPLATES, type TemplateName, type TemplateId, type TemplateCategory } from "@workspace/templates";
import type { TemplateName } from "@workspace/templates";

/**
 * Convenience lookup mapping semantic keys → canonical template display names.
 * The `satisfies Record<string, TemplateName>` clause ensures every value here
 * matches a real template name from the shared catalog — TypeScript will error
 * the moment a template is renamed or removed without updating this object.
 */
export const TEMPLATE_NAMES = {
  TIKTOK_VIRAL_HOOK:    "TikTok Viral Hook",
  UGC_REVIEW:           "UGC Review",
  BEFORE_AND_AFTER:     "Before & After",
  PRODUCT_DEMO:         "Product Demo",
  PRODUCT_UNBOXING:     "Product Unboxing",
  FLASH_SALE:           "Flash Sale",
  AMAZON_LISTING_VIDEO: "Amazon Listing Video",
  BRAND_STORY:          "Brand Story",
  TESTIMONIAL_STACK:    "Testimonial Stack",
  SHOPIFY_PROMO:        "Shopify Promo",
  TUTORIAL:             "Tutorial / How-To",
  INSTAGRAM_REEL:       "Instagram Reel",
} as const satisfies Record<string, TemplateName>;
