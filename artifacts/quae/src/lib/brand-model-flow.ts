export const QUAE_CHOICE_MODEL_INPUT={displayName:"Quae Brand Model",archetype:"quae_choice",adultAgeRange:"25–45",preferredEnvironments:[],referenceObjectPaths:[],referenceRightsAcknowledged:false} as const;
export function requiresQuaeBrandModel(style:string,modelId:string){return style==="brand_model"&&!modelId;}
export function canCreateBrandModelMockup(style:string,modelId:string,selectedReference?:string){return style!=="brand_model"||Boolean(modelId&&selectedReference);}

export type RecoverableBrandModel={id:string;archetype?:string;reference_object_paths?:string[]};
export function isPendingCandidateSet(model:RecoverableBrandModel){return model.archetype==="quae_choice"&&(model.reference_object_paths?.length??0)>1;}
export function findPendingCandidateSet<T extends RecoverableBrandModel>(models:T[]){return models.find(isPendingCandidateSet);}
