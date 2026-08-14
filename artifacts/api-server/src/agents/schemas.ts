import { z } from "@workspace/api-zod";
const short = z.string().min(1).max(500),
  reason = z.string().min(1).max(800);
export const evidenceRecordSchema = z
  .object({
    factId: z.string().regex(/^fact_\d{3,}$/),
    category: z.string().min(1).max(80),
    value: z.string().min(1).max(5000),
    source: z.string().min(1).max(120),
  })
  .strict();
export const researchInputSchema = z
  .object({
    ledger: z.array(evidenceRecordSchema).min(1).max(100),
    customerInstruction: z.string().max(5000),
  })
  .strict();
export const researchOutputSchema = z
  .object({
    audienceInsights: z.array(short).max(12),
    unknowns: z.array(short).max(12),
  })
  .strict();
export const strategyOutputSchema = z
  .object({
    objective: short,
    audience: short,
    positioning: short,
    corePromise: short,
    angle: short,
    objections: z.array(short).max(8),
    tone: z.string().min(1).max(120),
    channels: z.array(z.string().min(1).max(100)).max(8),
  })
  .strict();
export const strategyInputSchema = z
  .object({
    context: z.unknown(),
    ledger: z.array(evidenceRecordSchema),
    research: researchOutputSchema,
  })
  .strict();
export const hookSchema = z
  .object({
    text: z.string().min(5).max(300),
    rationale: reason,
    evidenceIds: z.array(z.string()).max(8),
  })
  .strict();
export const hooksOutputSchema = z
  .object({ hooks: z.array(hookSchema).min(12).max(20) })
  .strict();
export const hooksInputSchema = z
  .object({
    ledger: z.array(evidenceRecordSchema),
    research: researchOutputSchema,
    strategy: strategyOutputSchema,
  })
  .strict();
export const claimSchema = z
  .object({
    claim: z.string().min(1).max(1000),
    evidenceIds: z.array(z.string()).min(1).max(10),
  })
  .strict();
export const scriptOutputSchema = z
  .object({
    title: z.string().min(1).max(200),
    hook: z.string().min(5).max(300),
    script: z.string().min(100).max(8000),
    callToAction: z.string().min(1).max(300),
    claims: z.array(claimSchema).max(30),
    creativeRationale: reason,
  })
  .strict();
export const writerInputSchema = z
  .object({
    ledger: z.array(evidenceRecordSchema),
    research: researchOutputSchema,
    strategy: strategyOutputSchema,
    hooks: hooksOutputSchema,
    context: z.unknown(),
  })
  .strict();
const label = z.enum(["Candidate 1", "Candidate 2", "Candidate 3"]);
const rubric = z
  .object({
    hook: z.number().min(0).max(20),
    audienceRelevance: z.number().min(0).max(15),
    persuasion: z.number().min(0).max(15),
    specificity: z.number().min(0).max(10),
    emotionalPull: z.number().min(0).max(10),
    credibility: z.number().min(0).max(10),
    originality: z.number().min(0).max(10),
    brandFit: z.number().min(0).max(5),
    cta: z.number().min(0).max(5),
  })
  .strict();
export const judgeInputSchema = z
  .object({
    strategy: strategyOutputSchema,
    ledger: z.array(evidenceRecordSchema),
    candidates: z
      .array(z.object({ label, script: scriptOutputSchema }).strict())
      .length(3),
  })
  .strict();
export const judgeOutputSchema = z
  .object({
    candidates: z
      .array(
        z
          .object({
            label,
            scores: rubric,
            strengths: z.array(reason).max(8),
            weaknesses: z.array(reason).max(8),
            riskFlags: z.array(reason).max(8),
          })
          .strict(),
      )
      .length(3),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export const factCheckOutputSchema = z
  .object({
    pass: z.boolean(),
    unsupportedClaims: z.array(reason).max(20),
    conciseReasons: z.array(reason).max(20),
  })
  .strict();
export const rewriteInputSchema = z
  .object({
    winner: scriptOutputSchema,
    judge: z.unknown(),
    strategy: strategyOutputSchema,
    ledger: z.array(evidenceRecordSchema),
    qaIssues: z.array(reason).optional(),
    factcheckFailures: z.array(reason).optional(),
    deterministicFailures: z
      .array(
        z
          .object({
            script: z.string(),
            claim: z.string(),
            invalidEvidenceId: z.string(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
export const factCheckInputSchema = z
  .object({
    ledger: z.array(evidenceRecordSchema),
    finalScript: scriptOutputSchema,
    deterministicInvalid: z.array(
      z
        .object({
          script: z.string(),
          claim: z.string(),
          invalidEvidenceId: z.string(),
        })
        .strict(),
    ),
  })
  .strict();
export const qaOutputSchema = z
  .object({
    pass: z.boolean(),
    score: z.number().min(0).max(100),
    issues: z.array(reason).max(20),
    customerSummary: z.string().min(1).max(1000),
  })
  .strict();
export const qaInputSchema = z
  .object({
    context: z.unknown(),
    strategy: strategyOutputSchema,
    judge: z.unknown(),
    finalScript: scriptOutputSchema,
    factcheck: factCheckOutputSchema,
  })
  .strict();
export type Evidence = z.infer<typeof evidenceRecordSchema>;
export type Script = z.infer<typeof scriptOutputSchema>;
export function validateEvidenceReferences(
  ledger: Evidence[],
  scripts: Script[],
) {
  const ids = new Set(ledger.map((f) => f.factId));
  return scripts.flatMap((s) =>
    s.claims.flatMap((c) =>
      c.evidenceIds
        .filter((id) => !ids.has(id))
        .map((id) => ({
          script: s.title,
          claim: c.claim,
          invalidEvidenceId: id,
        })),
    ),
  );
}
