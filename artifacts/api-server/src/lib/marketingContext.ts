import { and, eq } from "drizzle-orm";
import { brandKitsTable, businessesTable, db, productImagesTable, productsTable } from "@workspace/db";

export type MarketingContext = ReturnType<typeof normalizeMarketingContext>;

export function belongsToBusiness(record: { businessId: string }, businessId: string): boolean {
  return record.businessId === businessId;
}

export function normalizeMarketingContext(input: {
  business: typeof businessesTable.$inferSelect;
  brand?: typeof brandKitsTable.$inferSelect | null;
  product?: (typeof productsTable.$inferSelect & { images: typeof productImagesTable.$inferSelect[] }) | null;
}) {
  const { business, brand = null, product = null } = input;
  return {
    business: {
      id: business.id, name: business.name, description: business.description, industry: business.industry,
      website: business.website, location: [business.city, business.region, business.country].filter(Boolean).join(", ") || null,
      targetAudience: business.targetCustomer, goal: business.primaryGoal, offerings: business.productsServices,
      tagline: business.tagline, cta: business.primaryCta, channels: business.preferredChannels, socialLinks: business.socialLinks,
    },
    brand: brand ? {
      voice: brand.voice, voiceDescription: brand.voiceDescription, personality: brand.personality,
      colors: { primary: brand.primaryColor, secondary: brand.secondaryColor, accent: brand.accentColor },
      fonts: brand.fontNames, likedPhrases: brand.likedPhrases, avoidedPhrases: brand.avoidedPhrases,
      cta: brand.defaultCta, notes: brand.notes, logos: [brand.logoObjectPath, brand.secondaryLogoObjectPath].filter(Boolean),
    } : null,
    product: product ? {
      id: product.id, name: product.name, type: product.type, description: product.description,
      category: product.category, benefits: product.benefits, features: product.features,
      targetAudience: product.targetCustomer, customerProblem: product.problemSolved,
      price: product.regularPrice, salePrice: product.salePrice, currency: product.currency,
      offer: product.offerNotes, cta: product.cta, url: product.productUrl,
      primaryImage: product.images.find((image) => image.role === "primary")?.objectPath ?? null,
      referenceImages: product.images.filter((image) => image.role === "reference").map((image) => image.objectPath),
    } : null,
  };
}

/** Provider-neutral, ownership-scoped context for future marketing agents. */
export async function getMarketingContext(userId: string, productId?: string): Promise<MarketingContext | null> {
  const [business] = await db.select().from(businessesTable).where(eq(businessesTable.userId, userId));
  if (!business) return null;
  const [brand] = await db.select().from(brandKitsTable).where(eq(brandKitsTable.businessId, business.id));
  let product: (typeof productsTable.$inferSelect & { images: typeof productImagesTable.$inferSelect[] }) | null = null;
  if (productId) {
    const [owned] = await db.select().from(productsTable).where(and(eq(productsTable.id, productId), eq(productsTable.businessId, business.id)));
    if (owned) {
      const images = await db.select().from(productImagesTable).where(eq(productImagesTable.productId, owned.id));
      product = { ...owned, images };
    }
  }
  return normalizeMarketingContext({ business, brand, product });
}
