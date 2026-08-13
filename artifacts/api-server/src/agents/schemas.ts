import { z } from "@workspace/api-zod";

export const evidenceRecordSchema = z.object({ factId: z.string().regex(/^fact_\d{3,}$/), category: z.string().min(1), value: z.string().min(1), source: z.string().min(1) }).strict();
export const researchInputSchema = z.object({ business: z.record(z.string(), z.unknown()), brand: z.record(z.string(), z.unknown()).nullable(), product: z.record(z.string(), z.unknown()).nullable(), customerInstruction: z.string().max(5000) }).strict();
export const researchOutputSchema = z.object({ evidence: z.array(evidenceRecordSchema).max(100), audienceInsights: z.array(z.string()).max(12), unknowns: z.array(z.string()).max(12) }).strict();
export const strategyInputSchema = z.object({ context: z.unknown(), research: researchOutputSchema }).strict();
export const strategyOutputSchema = z.object({ objective: z.string(), audience: z.string(), positioning: z.string(), corePromise: z.string(), angle: z.string(), objections: z.array(z.string()).max(8), tone: z.string(), channels: z.array(z.string()).max(8) }).strict();
export const hooksOutputSchema = z.object({ hooks: z.array(z.object({ text: z.string(), rationale: z.string(), evidenceIds: z.array(z.string()) }).strict()).min(3).max(12) }).strict();
export const hooksInputSchema = z.object({ research: researchOutputSchema, strategy: strategyOutputSchema }).strict();
export const claimSchema = z.object({ claim: z.string(), evidenceIds: z.array(z.string()) }).strict();
export const scriptOutputSchema = z.object({ title: z.string(), hook: z.string(), script: z.string(), callToAction: z.string(), claims: z.array(claimSchema), creativeRationale: z.string() }).strict();
export const writerInputSchema = z.object({ research: researchOutputSchema, strategy: strategyOutputSchema, hooks: hooksOutputSchema, context: z.unknown() }).strict();
export const judgeInputSchema = z.object({ strategy: strategyOutputSchema, research: researchOutputSchema, candidates: z.array(z.object({ label: z.enum(["Candidate 1","Candidate 2","Candidate 3"]), script: scriptOutputSchema }).strict()).length(3) }).strict();
export const judgeOutputSchema = z.object({ winner: z.enum(["Candidate 1", "Candidate 2", "Candidate 3"]), rubric: z.object({ strategy: z.number().min(0).max(10), hook: z.number().min(0).max(10), persuasion: z.number().min(0).max(10), brandAdherence: z.number().min(0).max(10), specificity: z.number().min(0).max(10), claimSafety: z.number().min(0).max(10), scriptQuality: z.number().min(0).max(10) }).strict(), total: z.number().min(0).max(100), confidence: z.number().min(0).max(1), strengths: z.array(z.string()), weaknesses: z.array(z.string()), riskFlags: z.array(z.string()) }).strict();
export const factCheckOutputSchema = z.object({ pass: z.boolean(), unsupportedClaims: z.array(z.string()), conciseReasons: z.array(z.string()) }).strict();
export const rewriteInputSchema = z.object({ winner: scriptOutputSchema, judge: judgeOutputSchema, strategy: strategyOutputSchema, research: researchOutputSchema }).strict();
export const factCheckInputSchema = z.object({ research: researchOutputSchema, finalScript: scriptOutputSchema, deterministicInvalid: z.array(z.object({ script:z.string(),claim:z.string(),invalidEvidenceId:z.string() }).strict()) }).strict();
export const qaOutputSchema = z.object({ pass: z.boolean(), score: z.number().min(0).max(100), issues: z.array(z.string()), customerSummary: z.string() }).strict();
export const qaInputSchema = z.object({ context:z.unknown(),strategy:strategyOutputSchema,judge:judgeOutputSchema,finalScript:scriptOutputSchema,factcheck:factCheckOutputSchema }).strict();
export type Evidence = z.infer<typeof evidenceRecordSchema>;
export type Script = z.infer<typeof scriptOutputSchema>;

export function validateEvidenceReferences(ledger: Evidence[], scripts: Script[]) {
  const ids = new Set(ledger.map((fact) => fact.factId));
  return scripts.flatMap((script) => script.claims.flatMap((claim) => claim.evidenceIds.filter((id) => !ids.has(id)).map((id) => ({ script: script.title, claim: claim.claim, invalidEvidenceId: id }))));
}
