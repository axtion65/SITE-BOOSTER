import { normalizeClipLength, RENDERING_MODEL_BY_ID } from "@workspace/plans";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Keeps every current production model on the shared 15/30/45-second advert contract. */
export function normalizeProductionModelDuration(modelId: unknown, duration: unknown): unknown {
  if (typeof modelId !== "string" || !RENDERING_MODEL_BY_ID[modelId]) return duration;
  return normalizeClipLength(modelId, typeof duration === "string" ? duration : null);
}

/**
 * Compatibility boundary for an already-open Studio tab or a legacy saved draft.
 * Provider selection still happens later; this only canonicalizes the free save request.
 */
export function normalizeProjectSubmissionBody(body: unknown): unknown {
  if (!isRecord(body)) return body;
  const sourceAssetId = typeof body.sourceAssetId === "string" && body.sourceAssetId.trim()
    ? body.sourceAssetId
    : null;
  const renderIntent = body.renderIntent === "animate" || body.renderIntent === "create_new"
    ? body.renderIntent
    : sourceAssetId
      ? "animate"
      : "create_new";
  return {
    ...body,
    duration: normalizeProductionModelDuration(body.renderingModelId, body.duration),
    renderIntent,
  };
}

export function projectValidationIssueFields(issues: ReadonlyArray<{ path: PropertyKey[] }>): string[] {
  return [...new Set(issues.map((issue) => String(issue.path[0] ?? "request")))].sort();
}
