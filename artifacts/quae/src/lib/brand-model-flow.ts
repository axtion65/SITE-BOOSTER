export const MODEL_PRESENTATIONS=["quae_choice","woman","man","nonbinary_androgynous"] as const;
export const MODEL_APPEARANCES=["quae_choice","black_african","white_european","hispanic_latino","east_asian","south_asian","middle_eastern_north_african","multiracial","diverse_mix"] as const;
export const ADULT_AGE_RANGES=["quae_choice","18–24","25–34","35–44","45–54","55+"] as const;
export const MODEL_STYLES=["quae_choice","casual_lifestyle","professional","fashion","athletic","creator_ugc","luxury_premium","streetwear"] as const;
export const SCENES=["quae_choice","clean_studio","outdoor_lifestyle","home_lifestyle","office_business","street_urban","gym_fitness","retail_store","event_celebration","seasonal_holiday","luxury_premium","custom"] as const;

export type ModelPreferences={presentation:typeof MODEL_PRESENTATIONS[number];appearance:typeof MODEL_APPEARANCES[number];age:typeof ADULT_AGE_RANGES[number];style:typeof MODEL_STYLES[number];additionalDirection:string};
export const DEFAULT_MODEL_PREFERENCES:ModelPreferences={presentation:"quae_choice",appearance:"quae_choice",age:"quae_choice",style:"quae_choice",additionalDirection:""};
export function brandModelInput(p:ModelPreferences,replacePendingCandidateSet=false){return {displayName:"Quae Brand Model",archetype:p.style,adultAgeRange:p.age,presentation:p.presentation,appearanceDescription:p.appearance,styling:p.additionalDirection,preferredEnvironments:[],referenceObjectPaths:[],referenceRightsAcknowledged:false,replacePendingCandidateSet};}
export function sceneDirection(scene:typeof SCENES[number],customScene:string){return {scene,customScene:scene==="custom"?customScene.trim():""};}
export function requiresQuaeBrandModel(style:string,modelId:string){return style==="brand_model"&&!modelId;}
export function canCreateBrandModelMockup(style:string,modelId:string,selectedReference?:string){return style!=="brand_model"||Boolean(modelId&&selectedReference);}
export type RecoverableBrandModel={id:string;archetype?:string;reference_object_paths?:string[]};
export function isPendingCandidateSet(model:RecoverableBrandModel){return (model.reference_object_paths?.length??0)>1;}
export function findPendingCandidateSet<T extends RecoverableBrandModel>(models:T[]){return models.find(isPendingCandidateSet);}
