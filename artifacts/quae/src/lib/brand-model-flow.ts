export const QUAE_CHOICE_MODEL_INPUT={displayName:"Quae Brand Model",archetype:"quae_choice",adultAgeRange:"25–45",preferredEnvironments:[],referenceObjectPaths:[],referenceRightsAcknowledged:false} as const;
export function requiresQuaeBrandModel(style:string,modelId:string){return style==="brand_model"&&!modelId;}
export function canCreateBrandModelMockup(style:string,modelId:string,selectedReference?:string){return style!=="brand_model"||Boolean(modelId&&selectedReference);}
