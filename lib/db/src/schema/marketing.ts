import { boolean, index, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const businessesTable = pgTable("businesses", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"), industry: text("industry"), website: text("website"),
  phone: text("phone"), publicEmail: text("public_email"), streetAddress: text("street_address"),
  city: text("city"), region: text("region"), country: text("country"),
  targetCustomer: text("target_customer"), primaryGoal: text("primary_goal"),
  productsServices: text("products_services"), primaryCta: text("primary_cta"), tagline: text("tagline"),
  preferredChannels: jsonb("preferred_channels").$type<string[]>().notNull().default([]),
  socialLinks: jsonb("social_links").$type<Record<string, string>>().notNull().default({}),
  ...timestamps,
}, (table) => [uniqueIndex("businesses_user_id_unique").on(table.userId)]);

export const brandKitsTable = pgTable("brand_kits", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  businessId: text("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  logoObjectPath: text("logo_object_path"), secondaryLogoObjectPath: text("secondary_logo_object_path"),
  primaryColor: text("primary_color"), secondaryColor: text("secondary_color"), accentColor: text("accent_color"),
  fontNames: jsonb("font_names").$type<string[]>().notNull().default([]),
  voice: text("voice"), voiceDescription: text("voice_description"), personality: text("personality"),
  likedPhrases: jsonb("liked_phrases").$type<string[]>().notNull().default([]),
  avoidedPhrases: jsonb("avoided_phrases").$type<string[]>().notNull().default([]),
  defaultCta: text("default_cta"), notes: text("notes"), ...timestamps,
}, (table) => [uniqueIndex("brand_kits_business_id_unique").on(table.businessId)]);

export const productsTable = pgTable("products", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  businessId: text("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(), type: text("type").notNull(), description: text("description"), category: text("category"),
  regularPrice: numeric("regular_price", { precision: 12, scale: 2 }), salePrice: numeric("sale_price", { precision: 12, scale: 2 }),
  currency: text("currency"), sku: text("sku"), productUrl: text("product_url"),
  benefits: jsonb("benefits").$type<string[]>().notNull().default([]), features: jsonb("features").$type<string[]>().notNull().default([]),
  targetCustomer: text("target_customer"), problemSolved: text("problem_solved"), offerNotes: text("offer_notes"), cta: text("cta"),
  active: boolean("active").notNull().default(true), ...timestamps,
}, (table) => [index("products_business_id_idx").on(table.businessId)]);

export const productImagesTable = pgTable("product_images", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  objectPath: text("object_path").notNull(), role: text("role").notNull().default("reference"),
  sortOrder: numeric("sort_order", { precision: 6, scale: 0 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("product_images_product_id_idx").on(table.productId), uniqueIndex("product_images_object_path_unique").on(table.objectPath)]);

export type Business = typeof businessesTable.$inferSelect;
export type BrandKit = typeof brandKitsTable.$inferSelect;
export type Product = typeof productsTable.$inferSelect;
export type ProductImage = typeof productImagesTable.$inferSelect;
