import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgres://test:test@127.0.0.1:5432/test";

test("normalized marketing context preserves optional fields and image relationships", async () => {
  const { normalizeMarketingContext } = await import("./marketingContext");
  const context = normalizeMarketingContext({
    business: { id: "business-1", userId: "user-1", name: "Acme", description: null, industry: "Retail", website: null, phone: null, publicEmail: null, streetAddress: null, city: null, region: null, country: null, targetCustomer: "Busy parents", primaryGoal: null, productsServices: null, primaryCta: "Shop now", tagline: null, preferredChannels: [], socialLinks: {}, createdAt: new Date(), updatedAt: new Date() },
    brand: null,
    product: { id: "product-1", businessId: "business-1", name: "Starter box", type: "product", description: null, category: null, regularPrice: "20.00", salePrice: null, currency: "USD", sku: null, productUrl: null, benefits: [], features: [], targetCustomer: null, problemSolved: null, offerNotes: null, cta: null, active: true, createdAt: new Date(), updatedAt: new Date(), images: [
      { id: "image-1", productId: "product-1", objectPath: "/objects/main", role: "primary", sortOrder: "0", createdAt: new Date() },
      { id: "image-2", productId: "product-1", objectPath: "/objects/ref", role: "reference", sortOrder: "1", createdAt: new Date() },
    ] },
  });
  assert.equal(context.business.description, null);
  assert.equal(context.brand, null);
  assert.equal(context.product?.primaryImage, "/objects/main");
  assert.deepEqual(context.product?.referenceImages, ["/objects/ref"]);
});

test("ownership isolation rejects records from another business", async () => {
  const { belongsToBusiness } = await import("./marketingContext");
  assert.equal(belongsToBusiness({ businessId: "mine" }, "mine"), true);
  assert.equal(belongsToBusiness({ businessId: "theirs" }, "mine"), false);
});
