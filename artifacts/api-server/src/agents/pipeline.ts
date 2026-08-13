import { createHash, randomInt } from "node:crypto";
import { pool } from "@workspace/db";
import type { z } from "@workspace/api-zod";
import { AgentModelRouter, type AgentRole } from "./modelRouter";
import { OpenAIResponsesProvider, isTransientProviderError, type AgentProvider } from "./provider";
import { factCheckInputSchema, factCheckOutputSchema, hooksInputSchema, hooksOutputSchema, judgeInputSchema, judgeOutputSchema, qaInputSchema, qaOutputSchema, researchInputSchema, researchOutputSchema, rewriteInputSchema, scriptOutputSchema, strategyInputSchema, strategyOutputSchema, validateEvidenceReferences, writerInputSchema } from "./schemas";

const versions={research:"research.v1",strategist:"strategist.v1",hooks:"hooks.v1",writerA:"writer-direct-response.v1",writerB:"writer-story.v1",writerC:"writer-social.v1",judge:"judge.v1",rewriter:"rewrite.v1",factcheck:"factcheck.v1",qa:"qa.v1"} as const;
const sleep=(ms:number)=>new Promise((resolve)=>setTimeout(resolve,ms));
export class CampaignPipeline {
 constructor(private provider:AgentProvider=new OpenAIResponsesProvider(),private models=new AgentModelRouter()){}
 private async agent<T>(runId:string,sequence:number,role:AgentRole,version:string,schema:z.ZodType<T>,system:string,data:unknown){
   const prior=await pool.query("SELECT structured_output FROM agent_runs WHERE campaign_run_id=$1 AND role=$2 AND sequence=$3 AND status='completed'",[runId,version,sequence]);
   if(prior.rows[0]) return schema.parse(prior.rows[0].structured_output);
   const config=this.models.get(role);const id=crypto.randomUUID();const hash=createHash("sha256").update(JSON.stringify(data)).digest("hex");const started=Date.now();
   await pool.query(`INSERT INTO agent_runs(id,campaign_run_id,role,sequence,status,prompt_version,schema_version,configured_model,input_hash) VALUES($1,$2,$3,$4,'running',$5,'v1',$6,$7) ON CONFLICT(campaign_run_id,role,sequence) DO UPDATE SET status='running',retry_count=agent_runs.retry_count+1,error_code=NULL`,[id,runId,version,sequence,version,config.model,hash]);
   let attempt=0;let schemaRepairAttempted=false;
   while(true){try{const selected=schemaRepairAttempted?this.models.get("schemaRepair"):config;const result=await this.provider.generate({role:schemaRepairAttempted?"schemaRepair":role,model:selected.model,reasoning:selected.reasoning,schema,schemaName:version.replace(/[^a-zA-Z0-9_]/g,"_"),system:schemaRepairAttempted?`${system}\nThis is the single permitted schema-repair attempt. Return a strictly valid complete result.`:system,data});await pool.query(`UPDATE agent_runs SET status='completed',actual_model=$2,structured_output=$3,input_tokens=$4,output_tokens=$5,cached_tokens=$6,latency_ms=$7,completed_at=NOW() WHERE campaign_run_id=$1 AND role=$8 AND sequence=$9`,[runId,result.actualModel,result.output,result.usage.inputTokens,result.usage.outputTokens,result.usage.cachedTokens,Date.now()-started,version,sequence]);return result.output;}catch(error){if(error instanceof Error&&error.message==="SCHEMA_INVALID"&&!schemaRepairAttempted){schemaRepairAttempted=true;continue;}if(attempt<2&&isTransientProviderError(error)){await sleep(500*2**attempt++);continue;}await pool.query("UPDATE agent_runs SET status='failed',error_code=$2,latency_ms=$3,completed_at=NOW() WHERE campaign_run_id=$1 AND role=$4 AND sequence=$5",[runId,error instanceof Error?error.message.slice(0,80):"PROVIDER_ERROR",Date.now()-started,version,sequence]);throw error;}}
 }
 async execute(runId:string,context:unknown){
   const stage=async(name:string)=>pool.query("UPDATE campaign_runs SET current_stage=$2,heartbeat_at=NOW(),updated_at=NOW() WHERE id=$1",[runId,name]);
   const snapshot=context as any;const researchInput=researchInputSchema.parse({business:snapshot.business,brand:snapshot.brand,product:snapshot.product,customerInstruction:JSON.stringify(snapshot.campaignBrief??{})});
   await stage("research");const research=await this.agent(runId,10,"research",versions.research,researchOutputSchema,"Create a precise evidence ledger using only supplied facts. Use sequential fact IDs. Record unknowns instead of guessing.",researchInput);
   const strategyInput=strategyInputSchema.parse({context,research});await stage("strategy");const strategy=await this.agent(runId,20,"strategist",versions.strategist,strategyOutputSchema,"Develop a campaign strategy grounded exclusively in the evidence ledger.",strategyInput);
   const hooksInput=hooksInputSchema.parse({research,strategy});await stage("hooks");const hooks=await this.agent(runId,30,"hooks",versions.hooks,hooksOutputSchema,"Create distinct scroll-stopping hooks. Cite valid evidence IDs for factual hooks.",hooksInput);
   await stage("writing_concepts");const shared=writerInputSchema.parse({research,strategy,hooks,context});
   const [a,b,c]=await Promise.all([
    this.agent(runId,40,"writer",versions.writerA,scriptOutputSchema,"You are the DIRECT RESPONSE specialist. Optimize clarity, benefits, objections, persuasion, and conversion. Cite evidence IDs for every factual claim.",shared),
    this.agent(runId,41,"writer",versions.writerB,scriptOutputSchema,"You are the STORY / EMOTIONAL specialist. Optimize human tension, desire, transformation, and memorable narrative. Cite evidence IDs for every factual claim.",shared),
    this.agent(runId,42,"writer",versions.writerC,scriptOutputSchema,"You are the NATIVE SOCIAL / CREATOR specialist. Optimize authenticity, platform-native language, scroll-stopping behavior, and natural delivery. Cite evidence IDs for every factual claim.",shared),
   ]);
   const invalid=validateEvidenceReferences(research.evidence,[a,b,c]);if(invalid.length){await pool.query("UPDATE campaign_runs SET status='needs_revision',qa_status='unsupported_claims',final_result=$2,completed_at=NOW(),lease_owner=NULL,lease_expires_at=NULL WHERE id=$1",[runId,{invalidEvidenceReferences:invalid}]);return;}
   const writers=[{key:"writerA",script:a},{key:"writerB",script:b},{key:"writerC",script:c}];for(let i=writers.length-1;i>0;i--){const j=randomInt(i+1);[writers[i],writers[j]]=[writers[j],writers[i]];}
   const candidates=writers.map((x,i)=>({label:`Candidate ${i+1}`,script:x.script}));const mapping=Object.fromEntries(writers.map((x,i)=>[`Candidate ${i+1}`,x.key]));await pool.query("UPDATE campaign_runs SET candidate_mapping=$2 WHERE id=$1",[runId,mapping]);
   const judgeInput=judgeInputSchema.parse({strategy,research,candidates});await stage("evaluating_scripts");const judge=await this.agent(runId,50,"judge",versions.judge,judgeOutputSchema,"Blindly judge candidates using the rubric. Candidate labels contain no authorship signal. Return concise reasons, never hidden reasoning.",judgeInput);
   const winner=candidates.find((x)=>x.label===judge.winner)!.script;
   const rewriteInput=rewriteInputSchema.parse({winner,judge,strategy,research});await stage("rewriting");const finalScript=await this.agent(runId,60,"rewriter",versions.rewriter,scriptOutputSchema,"Polish the winning script while preserving supported claims and brand adherence. Do not add facts.",rewriteInput);
   const finalInvalid=validateEvidenceReferences(research.evidence,[finalScript]);
   const factInput=factCheckInputSchema.parse({research,finalScript,deterministicInvalid:finalInvalid});await stage("fact_checking");const factcheck=await this.agent(runId,70,"factcheck",versions.factcheck,factCheckOutputSchema,"Semantically review every claim against the evidence. Fail any unsupported or overstated claim.",factInput);
   const qaInput=qaInputSchema.parse({context,strategy,judge,finalScript,factcheck});await stage("quality_checking");const qa=await this.agent(runId,80,"qa",versions.qa,qaOutputSchema,"Perform final brand, persuasion, specificity, safety, and customer-readiness QA. Never fake a pass.",qaInput);
   const minScore=Number(process.env.QUAE_CAMPAIGN_MIN_SCORE||75);const ready=qa.pass&&factcheck.pass&&!finalInvalid.length&&qa.score>=minScore;
   await pool.query(`UPDATE campaign_runs SET status=$2,current_stage=$3,final_result=$4,judge_score=$5,qa_status=$6,completed_at=NOW(),lease_owner=NULL,lease_expires_at=NULL,updated_at=NOW() WHERE id=$1`,[runId,ready?"ready_for_review":"needs_revision",ready?"customer_review":"quality_review_failed",{research,strategy,hooks,finalScript,judge,factcheck,qa},judge.total,ready?"pass":"failed"]);
   await pool.query("UPDATE campaigns SET status=$2,updated_at=NOW() WHERE id=(SELECT campaign_id FROM campaign_runs WHERE id=$1)",[runId,ready?"ready_for_review":"needs_revision"]);
 }
}
