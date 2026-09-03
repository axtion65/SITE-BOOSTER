import {
  scriptOutputSchema,
  strategyOutputSchema,
} from "../agents/schemas";
import { publicCampaignResult } from "./campaignReview";
import { deterministicCampaignFallback } from "./campaignSafeFallback";

export function revisionSourceInput(value: unknown, context: unknown) {
  const source = value as any;
  const strategy = strategyOutputSchema.safeParse(source?.strategy);
  const finalScript = scriptOutputSchema.safeParse(source?.finalScript);
  if (strategy.success && finalScript.success)
    return { strategy: strategy.data, finalScript: finalScript.data };

  const projected = publicCampaignResult(value);
  if (!projected) return null;
  const fallback = deterministicCampaignFallback(context);
  const compatibleStrategy = strategyOutputSchema.safeParse({
    ...fallback.strategy,
    angle: projected.strategy?.angle || fallback.strategy.angle,
    audience: projected.strategy?.audience || fallback.strategy.audience,
    positioning:
      projected.strategy?.positioning || fallback.strategy.positioning,
  });
  const compatibleScript = scriptOutputSchema.safeParse({
    ...fallback.finalScript,
    title: projected.finalScript.title || fallback.finalScript.title,
    hook: projected.finalScript.hook || fallback.finalScript.hook,
    script: projected.finalScript.script || fallback.finalScript.script,
    callToAction:
      projected.finalScript.callToAction ||
      fallback.finalScript.callToAction,
  });
  if (!compatibleStrategy.success || !compatibleScript.success) return null;
  return {
    strategy: compatibleStrategy.data,
    finalScript: compatibleScript.data,
  };
}
