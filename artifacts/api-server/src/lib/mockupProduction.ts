import { fal } from "@fal-ai/client";

export const PRIMARY_VIDEO_ENGINE = process.env.PRIMARY_VIDEO_ENGINE?.trim() || "ltx-fast";
export const PRIMARY_IMAGE_ENGINE = "fal-ai/nano-banana-2/edit";
export const PREMIUM_IMAGE_ENGINE = "fal-ai/nano-banana-pro/edit";
export const BRAND_MODEL_IMAGE_ENGINE = "fal-ai/nano-banana-2";
export const BRAND_MODEL_CANDIDATE_COUNT = 3;
export const CUSTOMER_SAFE_GENERATION_ERROR = "We couldn’t create this visual. Try again.";

export type MockupStyle = "product_hero" | "lifestyle" | "brand_model" | "social_ad";
export interface MockupGenerationRequest { productReferencePaths: string[]; style: MockupStyle; creativeDirection: string; brandModelReferencePaths?: string[]; aspectRatio?: "1:1"|"4:5"|"9:16"|"16:9" }
export interface MockupGenerationResult { temporaryUrl: string; width: number; height: number; contentType: string; providerJobRef: string; providerModel?: string }
export interface MockupImageProvider {
  generateMockup(input: MockupGenerationRequest): Promise<MockupGenerationResult>;
  editProductIntoScene(input: MockupGenerationRequest): Promise<MockupGenerationResult>;
  createBrandModel(input: Omit<MockupGenerationRequest, "productReferencePaths">): Promise<MockupGenerationResult[]>;
  composeProductWithBrandModel(input: MockupGenerationRequest): Promise<MockupGenerationResult>;
}

type FalImage={url?:string;width?:number;height?:number;content_type?:string};
export function buildFalImageInput(input:MockupGenerationRequest,referenceUrls:string[]){return {prompt:input.creativeDirection,image_urls:referenceUrls,num_images:1,aspect_ratio:input.aspectRatio||"4:5",resolution:"1K",output_format:"png"};}
export class FalMockupImageProvider implements MockupImageProvider {
  constructor(private readonly resolveReference:(path:string)=>Promise<string>){const key=process.env.FAL_KEY?.trim();if(!key)throw new Error("Image generation is not configured");fal.config({credentials:key});}
  private async run(model:string,input:Record<string,unknown>):Promise<MockupGenerationResult>{
    const result:any=await (fal as any).subscribe(model,{input,logs:false});
    const data=result?.data??result; const image:FalImage=data?.images?.[0]??data?.image;
    if(!image?.url)throw new Error("Image provider completed without an image");
    return {temporaryUrl:image.url,width:Number(image.width||0),height:Number(image.height||0),contentType:image.content_type||"image/png",providerJobRef:String(result?.requestId||result?.request_id||crypto.randomUUID()),providerModel:model};
  }
  private async edit(input:MockupGenerationRequest){
    const refs=await Promise.all([...input.productReferencePaths,...(input.brandModelReferencePaths||[])].map(this.resolveReference));
    return this.run(PRIMARY_IMAGE_ENGINE,buildFalImageInput(input,refs));
  }
  generateMockup(input:MockupGenerationRequest){return this.run(BRAND_MODEL_IMAGE_ENGINE,{prompt:input.creativeDirection,num_images:1,aspect_ratio:input.aspectRatio||"4:5",resolution:"1K",output_format:"png"});}
  editProductIntoScene(input:MockupGenerationRequest){return this.edit(input);}
  composeProductWithBrandModel(input:MockupGenerationRequest){return this.edit(input);}
  async createBrandModel(input:Omit<MockupGenerationRequest,"productReferencePaths">){const results=[];for(let i=0;i<BRAND_MODEL_CANDIDATE_COUNT;i++)results.push(await this.run(BRAND_MODEL_IMAGE_ENGINE,{prompt:`${input.creativeDirection} Candidate ${i+1}: distinct natural pose and framing.`,num_images:1,aspect_ratio:"4:5",resolution:"1K",output_format:"png"}));return results;}
}

export function chooseImageOperation(input: MockupGenerationRequest) {if(input.style==="brand_model"&&input.brandModelReferencePaths?.length)return "composeProductWithBrandModel" as const;return input.productReferencePaths.length?"editProductIntoScene" as const:"generateMockup" as const;}
export function chooseAspectRatio(style:MockupStyle,channel?:string){const c=(channel||"").toLowerCase();if(/story|reel|tiktok/.test(c))return "9:16" as const;if(/landscape|youtube/.test(c))return "16:9" as const;if(style==="product_hero")return "1:1" as const;return "4:5" as const;}
export function selectProductReferences(images:Array<{object_path:string;role:string;sort_order?:number}>,category?:string){const sorted=[...images].sort((a,b)=>(a.role==="primary"?-100:0)-(b.role==="primary"?-100:0)+Number(a.sort_order||0)-Number(b.sort_order||0));return sorted.slice(0,/shirt|apparel|garment|clothing/i.test(category||"")?2:1).map(x=>x.object_path);}
export function buildGenerationBrief(input:{style:MockupStyle;product:any;business:any;brandKit?:any;campaign?:any;brandModel?:any;revision?:string}){
  const apparel=/shirt|apparel|garment|clothing/i.test(input.product?.category||input.product?.name||"");
  const productRules=apparel?"AUTHORITATIVE PRODUCT REQUIREMENTS: preserve garment type, supplied garment color, supplied front artwork, artwork placement and proportions. Render natural fabric texture, believable seams and folds, and realistic fit. Do not replace artwork, transform the garment into another type, or invent extra logos, typography, brand marks, symbols, or background lettering.":"AUTHORITATIVE PRODUCT REQUIREMENTS: preserve supplied product shape, proportions, color, packaging, visible identity, and reference-supported markings. Do not invent claims, labels, certifications, pricing, discounts, or performance statements.";
  const person=input.brandModel?`Use the supplied person as the authoritative Brand Model reference. Preserve facial appearance, hair, approximate styling and visual identity while allowing pose, expression, camera angle and environment. Place or use the supplied product naturally and preserve its recognizable identity.`:"";
  const revision=input.revision?`REVISION: ${input.revision.replace(/(?:\$|€|£)\s?\d+(?:\.\d{2})?/g,"the approved offer").slice(0,1000)}. Preserve all other authoritative inputs.`:"";
  return `Create one polished, photorealistic commercial ${input.style.replaceAll("_"," ")} image for ${input.business?.industry||"this business"}. ${productRules} ${person} ${revision} Brand personality: ${input.brandKit?.personality||"premium and authentic"}. Audience: ${input.product?.target_customer||input.business?.target_customer||"the intended customer"}. GENERATIVE PIXEL POLICY: no price, CTA, caption, headline, business name, URL, QR code, promotional badge, invented label, invented logo, signage, UI text, background writing, or readable typography. Preserve text only when physically present in the authoritative supplied product reference. Exact factual copy is applied later outside generated pixels.`;
}
export function deriveBrandModelBrief(input:{archetype:string;business:any;brandKit?:any;product?:any;campaign?:any}){const selected=input.archetype==="quae_choice"?( /fitness|sport/i.test(input.business?.industry||"")?"athletic":/fashion|beauty/i.test(input.business?.industry||"")?"fashion":"lifestyle"):input.archetype;return `Create a fully synthetic adult ${selected} Brand Model for a ${input.business?.industry||"modern"} brand. This must not depict, identify, or impersonate a real person. Photorealistic commercial portrait, consistent recognizable face and hair, natural skin texture, premium lighting, clean environment, no text, logos, labels, symbols, watermarks, or writing. Brand personality: ${input.brandKit?.personality||"authentic and confident"}. Audience: ${input.business?.target_customer||"adults"}.`;}
export function visualQa(input:{objectPath?:string|null;contentType?:string;width?:number;height?:number;owned:boolean;productReferenceCount:number;completed:boolean}){const checks={outputExists:Boolean(input.objectPath),supportedPayload:["image/jpeg","image/png","image/webp"].includes(input.contentType||""),expectedDimensions:(input.width||0)>=768&&(input.height||0)>=768,correctAssetOwnership:input.owned,productReferenceAssociated:input.productReferenceCount>0,generationCompleted:input.completed};return {decision:Object.values(checks).every(Boolean)?"ready_for_review":"needs_revision",checks,note:"Quae verified delivery and production requirements. Exact artwork fidelity still requires your review."} as const;}
export function buildVideoHandoff(input:{approved:boolean;objectPath:string|null;campaign:any;product:any;brandModel:any;ids?:any}){if(!input.approved||!input.objectPath)throw new Error("Approve a visual before starting video production");return {source:"approved_mockup",authoritativeImagePath:input.objectPath,renderingModelId:PRIMARY_VIDEO_ENGINE,...input.ids,campaign:input.campaign,product:input.product,brandModel:input.brandModel,motionBrief:["Preserve the supplied person and product","Use natural motion and subtle camera movement","Maintain product visibility","Do not invent text, logos, or background writing","Do not change product identity"],composition:{exactCopyAppliedLater:true,pipeline:"approved_visual_to_footage_to_composer"}};}
