import { getFalModelId } from "./falvideo";

export type FalProviderReadinessCode =
  | "ready"
  | "not_configured"
  | "credentials_invalid"
  | "access_denied"
  | "rate_limited"
  | "model_unavailable"
  | "provider_unavailable";

export interface FalProviderReadiness {
  ready: boolean;
  code: FalProviderReadinessCode;
  endpointId: string;
  httpStatus?: number;
}

interface ReadinessOptions {
  renderingModelId: string;
  hasImage: boolean;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Authenticate the configured key against the exact production model without
 * submitting inference. FAL's pricing endpoint is read-only and API-key scoped.
 */
export async function checkFalProviderReadiness({
  renderingModelId,
  hasImage,
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 5_000,
}: ReadinessOptions): Promise<FalProviderReadiness> {
  const endpointId = getFalModelId(renderingModelId, hasImage);
  const falKey = env.FAL_KEY?.trim();
  if (!falKey) return { ready: false, code: "not_configured", endpointId };

  const url = new URL("https://api.fal.ai/v1/models/pricing");
  url.searchParams.set("endpoint_id", endpointId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Key ${falKey}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      const code: FalProviderReadinessCode = response.status === 401
        ? "credentials_invalid"
        : response.status === 403
          ? "access_denied"
          : response.status === 429
            ? "rate_limited"
            : "provider_unavailable";
      return { ready: false, code, endpointId, httpStatus: response.status };
    }

    const body = await response.json().catch(() => null) as {
      prices?: Array<{ endpoint_id?: string; unit_price?: number }>;
    } | null;
    const available = body?.prices?.some((price) =>
      price.endpoint_id === endpointId && Number.isFinite(price.unit_price));
    return available
      ? { ready: true, code: "ready", endpointId, httpStatus: response.status }
      : { ready: false, code: "model_unavailable", endpointId, httpStatus: response.status };
  } catch {
    return { ready: false, code: "provider_unavailable", endpointId };
  } finally {
    clearTimeout(timeout);
  }
}
