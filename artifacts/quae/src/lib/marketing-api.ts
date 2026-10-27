export function apiHeaders(json = true): HeadersInit {
  const token = localStorage.getItem("quae_token");
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}
export class MarketingApiError extends Error { constructor(message:string,public readonly requestId?:string){super(message);this.name="MarketingApiError";} }
export const MARKETING_API_PREFIX = "/api";
export function marketingApiPath(path: string): string {
  if (!path.startsWith("/") || path === "/api" || path.startsWith("/api/")) {
    throw new Error(`marketingApi expects a relative API path, received "${path}"`);
  }
  return `${MARKETING_API_PREFIX}${path}`;
}
export async function marketingApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(marketingApiPath(path), { ...init, headers: { ...apiHeaders(init?.body !== undefined), ...init?.headers } });
  if (!response.ok) { const data = await response.json().catch(() => null); throw new MarketingApiError(data?.error || "Something went wrong",typeof data?.requestId === "string" ? data.requestId : response.headers.get("x-request-id") || undefined); }
  return response.status === 204 ? undefined as T : response.json();
}

async function reportUploadFailure(statusCode: number): Promise<string | undefined> {
  try {
    const response = await fetch(marketingApiPath('/storage/uploads/report-failure'), {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ stage: 'storage_put', statusCode }),
      keepalive: true,
    });
    if (!response.ok) return undefined;
    const data = await response.json().catch(() => null) as { requestId?: unknown } | null;
    return typeof data?.requestId === 'string' && data.requestId ? data.requestId : undefined;
  } catch {
    return undefined;
  }
}

function uploadFailureMessage(statusCode: number, requestId?: string): string {
  const detail = statusCode > 0 ? ` (${statusCode})` : '';
  const support = requestId ? ` Support code: ${requestId}.` : '';
  return `Image upload failed${detail}. Please retry once.${support}`;
}

export async function uploadMarketingImage(file: File): Promise<string> {
  const contentType = file.type || 'image/jpeg';
  const intent = await marketingApi<{ uploadURL: string; objectPath: string; finalizeToken: string }>("/storage/uploads/request-url", { method: "POST", body: JSON.stringify({ name: file.name, size: file.size, contentType }) });
  let uploaded: Response;
  try {
    uploaded = await fetch(intent.uploadURL, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
  } catch {
    const requestId = await reportUploadFailure(0);
    throw new MarketingApiError(uploadFailureMessage(0, requestId), requestId);
  }
  if (!uploaded.ok) {
    const data = await uploaded.json().catch(() => null) as { error?: unknown } | null;
    const detail = typeof data?.error === "string" && data.error.length <= 200 ? data.error : null;
    const requestId = await reportUploadFailure(uploaded.status);
    const support = requestId ? ` Support code: ${requestId}.` : '';
    throw new MarketingApiError(detail ? `${detail}${support}` : uploadFailureMessage(uploaded.status, requestId), requestId);
  }
  await marketingApi("/storage/uploads/finalize", { method: "POST", body: JSON.stringify({ objectPath: intent.objectPath, finalizeToken: intent.finalizeToken }) });
  return intent.objectPath;
}
export function privateImageUrl(path?: string | null) {
  if (!path) return "";
  const objectKey = path
    .replace(/^\/api\/storage\/objects\//, "")
    .replace(/^\/objects\//, "");
  return `/api/storage/objects/${objectKey}`;
}
