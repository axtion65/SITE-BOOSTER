import { pgTable, text, timestamp, integer, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectsTable = pgTable("projects", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  campaignId: text("campaign_id"),
  campaignRunId: text("campaign_run_id"),
  campaignVideoBriefId: text("campaign_video_brief_id"),
  mockupProjectId: text("mockup_project_id"),
  mockupVersionId: text("mockup_version_id"),
  idempotencyKey: text("idempotency_key"),
  confirmedAt: timestamp("confirmed_at"),
  qualityStatus: text("quality_status").notNull().default("pending"),
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
  renderAttempt: integer("render_attempt").notNull().default(1),
  voiceId: text("voice_id"),
  productionVersion: text("production_version"),
  productionPlan: jsonb("production_plan"),
  voiceoverPath: text("voiceover_path"),
  voiceoverDurationMs: integer("voiceover_duration_ms"),
  targetDurationSeconds: integer("target_duration_seconds"),
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

/** Durable, independently retryable provider work for one assembled advert. */
export const videoRenderScenesTable = pgTable("video_render_scenes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  renderAttempt: integer("render_attempt").notNull(),
  sceneIndex: integer("scene_index").notNull(),
  status: text("status").notNull().default("pending"),
  providerModelId: text("provider_model_id").notNull(),
  providerRequestId: text("provider_request_id"),
  providerToken: text("provider_token"),
  prompt: text("prompt").notNull(),
  narrationText: text("narration_text").notNull().default(""),
  sourceAssetPath: text("source_asset_path"),
  outputPath: text("output_path"),
  expectedDurationMs: integer("expected_duration_ms").notNull(),
  actualDurationMs: integer("actual_duration_ms"),
  retryCount: integer("retry_count").notNull().default(0),
  pollCount: integer("poll_count").notNull().default(0),
  providerCostCents: integer("provider_cost_cents"),
  failureCode: text("failure_code"),
  failureMessage: text("failure_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("video_render_scenes_project_attempt_index_unique").on(table.projectId, table.renderAttempt, table.sceneIndex),
  uniqueIndex("video_render_scenes_provider_request_unique").on(table.providerRequestId),
  index("video_render_scenes_project_status_idx").on(table.projectId, table.renderAttempt, table.status),
]);

export type VideoRenderScene = typeof videoRenderScenesTable.$inferSelect;
