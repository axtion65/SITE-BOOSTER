import type { z } from "@workspace/api-zod";
import {
  factCheckInputSchema,
  factCheckOutputSchema,
  qaOutputSchema,
  rewriteInputSchema,
  scriptOutputSchema,
  strategyOutputSchema,
  validateEvidenceReferences,
} from "./schemas";

type QualityCycleArgs = {
  finalScript: z.infer<typeof scriptOutputSchema>;
  ledger: z.infer<typeof factCheckInputSchema>["ledger"];
  strategy: z.infer<typeof strategyOutputSchema>;
  judge: unknown;
  checkFacts: (
    script: z.infer<typeof scriptOutputSchema>,
    deterministicInvalid: ReturnType<typeof validateEvidenceReferences>,
    cycle: number,
  ) => Promise<z.infer<typeof factCheckOutputSchema>>;
  checkQa: (
    script: z.infer<typeof scriptOutputSchema>,
    factcheck: z.infer<typeof factCheckOutputSchema>,
    cycle: number,
  ) => Promise<z.infer<typeof qaOutputSchema>>;
  repair: (
    input: z.infer<typeof rewriteInputSchema>,
  ) => Promise<z.infer<typeof scriptOutputSchema>>;
};

/** Runs the initial quality review and, at most, one evidence-grounded repair. */
export async function runBoundedQualityCycle(args: QualityCycleArgs) {
  let finalScript = args.finalScript;
  let factcheck!: z.infer<typeof factCheckOutputSchema>;
  let qa!: z.infer<typeof qaOutputSchema>;
  let finalInvalid: ReturnType<typeof validateEvidenceReferences> = [];

  for (let cycle = 0; cycle < 2; cycle++) {
    finalInvalid = validateEvidenceReferences(args.ledger, [finalScript]);
    factcheck = await args.checkFacts(finalScript, finalInvalid, cycle);
    qa = await args.checkQa(finalScript, factcheck, cycle);
    if (qa.pass && factcheck.pass && !finalInvalid.length) break;
    if (cycle === 0) {
      finalScript = await args.repair(
        rewriteInputSchema.parse({
          winner: finalScript,
          judge: args.judge,
          strategy: args.strategy,
          ledger: args.ledger,
          qaIssues: qa.issues,
          factcheckFailures: [
            ...factcheck.unsupportedClaims,
            ...factcheck.conciseReasons,
          ],
          deterministicFailures: finalInvalid,
        }),
      );
    }
  }

  return { finalScript, factcheck, qa, finalInvalid };
}

export function qualityCycleReady(
  quality: Awaited<ReturnType<typeof runBoundedQualityCycle>>,
  minimumScore: number,
) {
  return (
    quality.qa.pass &&
    quality.factcheck.pass &&
    !quality.finalInvalid.length &&
    quality.qa.score >= minimumScore
  );
}
