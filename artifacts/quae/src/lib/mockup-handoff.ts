export type MockupVideoHandoff={source:"approved_mockup";authoritativeImagePath:string;renderingModelId:string;campaign:any;product:any;brandModel:any;motionBrief:string[];composition:{exactCopyAppliedLater:boolean;pipeline:string}};
const KEY="quae_approved_mockup_handoff";
export function saveMockupVideoHandoff(value:MockupVideoHandoff){sessionStorage.setItem(KEY,JSON.stringify(value));localStorage.removeItem("quae_studio_draft")}
export function loadMockupVideoHandoff(){try{return JSON.parse(sessionStorage.getItem(KEY)||"") as MockupVideoHandoff}catch{return null}}
