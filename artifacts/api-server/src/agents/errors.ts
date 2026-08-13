export type CampaignErrorKind = "retryable" | "permanent";

export class CampaignError extends Error {
  constructor(
    public readonly code: string,
    public readonly kind: CampaignErrorKind,
    message = code,
  ) {
    super(message);
    this.name = "CampaignError";
  }
}

const permanentCodes = new Set([
  "INVALID_EVIDENCE_LEDGER",
  "INVALID_CAMPAIGN_CONTEXT",
  "INVALID_AGENT_INPUT",
  "SCHEMA_REPAIR_EXHAUSTED",
  "INSUFFICIENT_VALID_CANDIDATES",
]);

export function classifyCampaignError(error: unknown): {
  code: string;
  retryable: boolean;
} {
  if (error instanceof CampaignError) {
    return { code: error.code, retryable: error.kind === "retryable" };
  }
  const status = (error as { status?: number }).status;
  if (status === 429) return { code: "PROVIDER_RATE_LIMIT", retryable: true };
  if (status && status >= 500)
    return { code: "PROVIDER_UNAVAILABLE", retryable: true };
  if (error instanceof Error) {
    if (permanentCodes.has(error.message))
      return { code: error.message, retryable: false };
    if (
      /timeout|network|ECONNRESET|ECONNREFUSED|57P01|40001|40P01/i.test(
        error.message,
      )
    ) {
      return { code: "TEMPORARY_INFRASTRUCTURE_FAILURE", retryable: true };
    }
    if (error.message === "SCHEMA_INVALID")
      return { code: "SCHEMA_REPAIR_EXHAUSTED", retryable: false };
  }
  return { code: "PIPELINE_PERMANENT_FAILURE", retryable: false };
}

export function workerFailureUpdate(error: unknown, retryCount: number) {
  const classified = classifyCampaignError(error);
  const retry = classified.retryable && retryCount < 2;
  return { ...classified, status: retry ? "queued" : "failed", retry } as const;
}
