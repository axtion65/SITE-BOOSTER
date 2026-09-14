type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" ? value as UnknownRecord : null;
}

function safeToken(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return /^[A-Za-z0-9_.:-]{1,80}$/.test(normalized) ? normalized : undefined;
}

function safeHttpStatus(value: unknown): number | undefined {
  const status = typeof value === "number" ? value : Number.NaN;
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
}

/**
 * Keep logs useful without copying provider messages, response bodies, URLs,
 * prompts, or other customer-controlled content into operational telemetry.
 */
export function safeErrorMetadata(error: unknown): {
  errorType: string;
  errorCode?: string;
  httpStatus?: number;
} {
  const outer = asRecord(error);
  const cause = asRecord(outer?.cause);
  const response = asRecord(outer?.response) ?? asRecord(cause?.response);
  const errorType = safeToken(outer?.name) ?? safeToken(cause?.name) ?? "OperationalError";
  const errorCode = safeToken(outer?.code) ?? safeToken(cause?.code);
  const httpStatus = safeHttpStatus(outer?.status)
    ?? safeHttpStatus(outer?.statusCode)
    ?? safeHttpStatus(cause?.status)
    ?? safeHttpStatus(cause?.statusCode)
    ?? safeHttpStatus(response?.status);

  return {
    errorType,
    ...(errorCode ? { errorCode } : {}),
    ...(httpStatus ? { httpStatus } : {}),
  };
}
