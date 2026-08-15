import { z } from "@workspace/api-zod";

export const DEFAULT_SCENE_DIRECTION = {
  scene: "quae_choice" as const,
  customScene: "",
};

export const sceneDirectionSchema = z
  .object({
    scene: z.enum([
      "quae_choice", "clean_studio", "outdoor_lifestyle", "home_lifestyle",
      "office_business", "street_urban", "gym_fitness", "retail_store",
      "event_celebration", "seasonal_holiday", "luxury_premium", "custom",
    ]),
    customScene: z.string().trim().max(500).default(""),
  })
  .refine(value => value.scene !== "custom" || value.customScene.length > 0, {
    message: "Describe the custom scene to continue",
    path: ["customScene"],
  });

export const mockupCreateSchema = z.object({
  productId: z.string().uuid(),
  campaignId: z.string().uuid().nullable().optional(),
  brandModelId: z.string().uuid().nullable().optional(),
  creationPath: z.enum(["product_hero", "lifestyle", "brand_model", "social_ad"]),
  // Older clients predate scene controls. Default only when the whole field is absent.
  sceneDirection: sceneDirectionSchema.optional().default(DEFAULT_SCENE_DIRECTION),
});

export function mockupCreateValidationError(error: z.ZodError): string {
  if (error.issues.some(issue => issue.path[0] === "sceneDirection" && issue.path.includes("customScene"))) {
    return "Describe the custom scene to continue";
  }
  if (error.issues.some(issue => issue.path[0] === "sceneDirection")) {
    return "Choose a valid scene direction";
  }
  return "Choose a valid product and visual style";
}
