export const PRIMARY_VIDEO_ENGINE = process.env.PRIMARY_VIDEO_ENGINE?.trim() || "ltx-fast";
export const CUSTOMER_SAFE_GENERATION_ERROR = "We couldn’t create this visual. Try again.";

export type MockupStyle = "product_hero" | "lifestyle" | "brand_model" | "social_ad";
export interface MockupGenerationRequest { productReferencePaths: string[]; style: MockupStyle; creativeDirection: string; brandModelReferencePaths?: string[] }
export interface MockupGenerationResult { temporaryUrl: string; width: number; height: number; contentType: string; providerJobRef: string }
export interface MockupImageProvider {
  generateMockup(input: MockupGenerationRequest): Promise<MockupGenerationResult>;
  editProductIntoScene(input: MockupGenerationRequest): Promise<MockupGenerationResult>;
  createBrandModel(input: Omit<MockupGenerationRequest, "productReferencePaths">): Promise<MockupGenerationResult[]>;
  composeProductWithBrandModel(input: MockupGenerationRequest): Promise<MockupGenerationResult>;
}
export function chooseImageOperation(input: MockupGenerationRequest) {
  if (input.style === "brand_model" && input.brandModelReferencePaths?.length) return "composeProductWithBrandModel" as const;
  return input.productReferencePaths.length ? "editProductIntoScene" as const : "generateMockup" as const;
}
export function visualQa(input: { objectPath?: string | null; contentType?: string; width?: number; height?: number; owned: boolean; productReferenceCount: number; completed: boolean }) {
  const checks = { outputExists: Boolean(input.objectPath), supportedPayload: ["image/jpeg", "image/png", "image/webp"].includes(input.contentType || ""), expectedDimensions: (input.width || 0) >= 768 && (input.height || 0) >= 768, correctAssetOwnership: input.owned, productReferenceAssociated: input.productReferenceCount > 0, generationCompleted: input.completed };
  return { decision: Object.values(checks).every(Boolean) ? "ready_for_review" : "needs_revision", checks, note: "Quae verified delivery and production requirements. Exact artwork fidelity still requires your review." } as const;
}
export function buildVideoHandoff(input: { approved: boolean; objectPath: string | null; campaign: any; product: any; brandModel: any }) {
  if (!input.approved || !input.objectPath) throw new Error("Approve a visual before starting video production");
  return { source: "approved_mockup", authoritativeImagePath: input.objectPath, renderingModelId: PRIMARY_VIDEO_ENGINE, campaign: input.campaign, product: input.product, brandModel: input.brandModel,
    motionBrief: ["Preserve the supplied person and product", "Use natural motion and subtle camera movement", "Maintain product visibility", "Do not invent text, logos, or background writing", "Do not change product identity"],
    composition: { exactCopyAppliedLater: true, pipeline: "approved_visual_to_footage_to_composer" } };
}
