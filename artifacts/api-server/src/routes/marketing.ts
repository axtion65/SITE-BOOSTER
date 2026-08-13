import { Router } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "@workspace/api-zod";
import { brandKitsTable, businessesTable, db, productImagesTable, productsTable } from "@workspace/db";
import { resolveUserIdFromToken } from "./auth";
import { ObjectPermission } from "../lib/objectAcl";
import { ObjectStorageService } from "../lib/objectStorage";
import { getMarketingContext } from "../lib/marketingContext";

const router = Router();
const optionalText = z.string().trim().max(5000).nullable().optional();
const optionalUrl = z.union([z.literal(""), z.string().url()]).nullable().optional().transform((v) => v || null);
const color = z.union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/)]).nullable().optional().transform((v) => v || null);
const textList = z.array(z.string().trim().min(1).max(200)).max(30).optional();
export const businessBody = z.object({
  name: z.string().trim().min(1).max(200), description: optionalText, industry: optionalText, website: optionalUrl,
  phone: optionalText, publicEmail: z.union([z.literal(""), z.string().email()]).nullable().optional().transform((v) => v || null),
  streetAddress: optionalText, city: optionalText, region: optionalText, country: optionalText, targetCustomer: optionalText,
  primaryGoal: optionalText, productsServices: optionalText, primaryCta: optionalText, tagline: optionalText,
  preferredChannels: textList, socialLinks: z.record(z.string(), z.union([z.literal(""), z.string().url()])).optional(),
});
export const brandBody = z.object({
  logoObjectPath: optionalText, secondaryLogoObjectPath: optionalText, primaryColor: color, secondaryColor: color, accentColor: color,
  fontNames: textList, voice: optionalText, voiceDescription: optionalText, personality: optionalText,
  likedPhrases: textList, avoidedPhrases: textList, defaultCta: optionalText, notes: optionalText,
});
const price = z.union([z.number().nonnegative().max(9999999999), z.string().regex(/^\d+(\.\d{1,2})?$/)]).nullable().optional().transform((v) => v == null ? null : String(v));
export const productBody = z.object({
  name: z.string().trim().min(1).max(200), type: z.enum(["product", "service"]), description: optionalText, category: optionalText,
  regularPrice: price, salePrice: price, currency: z.string().trim().max(3).nullable().optional(), sku: optionalText, productUrl: optionalUrl,
  benefits: textList, features: textList, targetCustomer: optionalText, problemSolved: optionalText, offerNotes: optionalText, cta: optionalText,
  active: z.boolean().optional(),
});

async function userId(req: { headers: { authorization?: string } }, res: any) {
  const id = await resolveUserIdFromToken(req.headers.authorization);
  if (!id) res.status(401).json({ error: "Not authenticated" });
  return id;
}
async function ownedBusiness(ownerId: string) {
  return (await db.select().from(businessesTable).where(eq(businessesTable.userId, ownerId)))[0] ?? null;
}
async function serializeProduct(product: typeof productsTable.$inferSelect) {
  const images = await db.select().from(productImagesTable).where(eq(productImagesTable.productId, product.id)).orderBy(asc(productImagesTable.sortOrder));
  return { ...product, images };
}
async function validateObjectOwnership(ownerId: string, objectPath: string) {
  if (!objectPath.startsWith("/objects/")) return false;
  try {
    const storage = new ObjectStorageService();
    const file = await storage.getObjectEntityFile(objectPath);
    return storage.canAccessObjectEntity({ userId: ownerId, objectFile: file, requestedPermission: ObjectPermission.READ });
  } catch { return false; }
}

router.get("/business", async (req, res) => { const id = await userId(req, res); if (!id) return; const business = await ownedBusiness(id); res.json(business); });
router.put("/business", async (req, res) => {
  const id = await userId(req, res); if (!id) return; const parsed = businessBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid business profile", details: parsed.error.flatten() }); return; }
  const [business] = await db.insert(businessesTable).values({ id: crypto.randomUUID(), userId: id, ...parsed.data }).onConflictDoUpdate({ target: businessesTable.userId, set: { ...parsed.data, updatedAt: new Date() } }).returning();
  res.json(business);
});
router.get("/brand-kit", async (req, res) => { const id = await userId(req, res); if (!id) return; const b = await ownedBusiness(id); if (!b) { res.json(null); return; } const [kit] = await db.select().from(brandKitsTable).where(eq(brandKitsTable.businessId, b.id)); res.json(kit ?? null); });
router.put("/brand-kit", async (req, res) => {
  const id = await userId(req, res); if (!id) return; const b = await ownedBusiness(id); if (!b) { res.status(409).json({ error: "Create your business profile first" }); return; }
  const parsed = brandBody.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: "Invalid brand kit", details: parsed.error.flatten() }); return; }
  for (const path of [parsed.data.logoObjectPath, parsed.data.secondaryLogoObjectPath]) if (path && !(await validateObjectOwnership(id, path))) { res.status(403).json({ error: "Logo is not owned by this account" }); return; }
  const [kit] = await db.insert(brandKitsTable).values({ id: crypto.randomUUID(), businessId: b.id, ...parsed.data }).onConflictDoUpdate({ target: brandKitsTable.businessId, set: { ...parsed.data, updatedAt: new Date() } }).returning(); res.json(kit);
});
router.get("/products", async (req, res) => { const id = await userId(req, res); if (!id) return; const b = await ownedBusiness(id); if (!b) { res.json([]); return; } const rows = await db.select().from(productsTable).where(eq(productsTable.businessId, b.id)).orderBy(sql`${productsTable.updatedAt} desc`); res.json(await Promise.all(rows.map(serializeProduct))); });
router.get("/products/:id", async (req, res) => { const id = await userId(req, res); if (!id) return; const b = await ownedBusiness(id); if (!b) { res.status(404).json({ error: "Not found" }); return; } const [p] = await db.select().from(productsTable).where(and(eq(productsTable.id, req.params.id), eq(productsTable.businessId, b.id))); if (!p) { res.status(404).json({ error: "Not found" }); return; } res.json(await serializeProduct(p)); });
router.post("/products", async (req, res) => { const id = await userId(req, res); if (!id) return; const b = await ownedBusiness(id); if (!b) { res.status(409).json({ error: "Create your business profile first" }); return; } const parsed = productBody.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: "Invalid product", details: parsed.error.flatten() }); return; } const [p] = await db.insert(productsTable).values({ id: crypto.randomUUID(), businessId: b.id, ...parsed.data }).returning(); res.status(201).json(await serializeProduct(p)); });
router.patch("/products/:id", async (req, res) => { const id = await userId(req, res); if (!id) return; const b = await ownedBusiness(id); if (!b) { res.status(404).json({ error: "Not found" }); return; } const parsed = productBody.partial().safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: "Invalid product", details: parsed.error.flatten() }); return; } const [p] = await db.update(productsTable).set({ ...parsed.data, updatedAt: new Date() }).where(and(eq(productsTable.id, req.params.id), eq(productsTable.businessId, b.id))).returning(); if (!p) { res.status(404).json({ error: "Not found" }); return; } res.json(await serializeProduct(p)); });
router.delete("/products/:id", async (req, res) => { const id = await userId(req, res); if (!id) return; const b = await ownedBusiness(id); if (!b) { res.status(404).json({ error: "Not found" }); return; } const [p] = await db.update(productsTable).set({ active: false, updatedAt: new Date() }).where(and(eq(productsTable.id, req.params.id), eq(productsTable.businessId, b.id))).returning(); if (!p) { res.status(404).json({ error: "Not found" }); return; } res.json(await serializeProduct(p)); });
router.post("/products/:id/images", async (req, res) => {
  const id = await userId(req, res); if (!id) return; const b = await ownedBusiness(id); if (!b) { res.status(404).json({ error: "Not found" }); return; }
  const parsed = z.object({ objectPath: z.string().startsWith("/objects/"), role: z.enum(["primary", "reference"]).default("reference") }).safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: "Invalid image reference" }); return; }
  const [p] = await db.select().from(productsTable).where(and(eq(productsTable.id, req.params.id), eq(productsTable.businessId, b.id))); if (!p) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await validateObjectOwnership(id, parsed.data.objectPath))) { res.status(403).json({ error: "Image is not owned by this account" }); return; }
  await db.transaction(async (tx) => { if (parsed.data.role === "primary") await tx.update(productImagesTable).set({ role: "reference" }).where(and(eq(productImagesTable.productId, p.id), eq(productImagesTable.role, "primary"))); await tx.insert(productImagesTable).values({ id: crypto.randomUUID(), productId: p.id, ...parsed.data }); });
  res.status(201).json(await serializeProduct(p));
});
router.delete("/products/:productId/images/:imageId", async (req, res) => { const id = await userId(req, res); if (!id) return; const b = await ownedBusiness(id); if (!b) { res.status(404).json({ error: "Not found" }); return; } const [p] = await db.select().from(productsTable).where(and(eq(productsTable.id, req.params.productId), eq(productsTable.businessId, b.id))); if (!p) { res.status(404).json({ error: "Not found" }); return; } const deleted = await db.delete(productImagesTable).where(and(eq(productImagesTable.id, req.params.imageId), eq(productImagesTable.productId, p.id))).returning(); if (!deleted.length) { res.status(404).json({ error: "Not found" }); return; } res.status(204).end(); });
router.get("/marketing-context", async (req, res) => { const id = await userId(req, res); if (!id) return; const context = await getMarketingContext(id, typeof req.query.productId === "string" ? req.query.productId : undefined); if (!context) { res.status(404).json({ error: "Business profile not found" }); return; } res.json(context); });

export default router;
