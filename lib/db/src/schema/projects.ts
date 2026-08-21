import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectsTable = pgTable("projects", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  campaignId: text("campaign_id"),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  renderingModelId: text("rendering_model_id").notNull().default("ovi"),
  script: text("script"),
  expandedScript: text("expanded_script"),
  platform: text("platform"),
  duration: text("duration"),
  videoUrl: text("video_url"),
  thumbnailUrl: text("thumbnail_url"),
  templateId: text("template_id"),
  productImageUrl: text("product_image_url"),
  renderIntent: text("render_intent").notNull().default("create_new"),
  sourceAssetId: text("source_asset_id"),
  creditCharge: integer("credit_charge").notNull().default(0),
  refundedAt: timestamp("refunded_at"),
  voiceId: text("voice_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
