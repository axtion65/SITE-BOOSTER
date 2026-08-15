export function apiHeaders(json = true): HeadersInit {
  const token = localStorage.getItem("quae_token");
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}
export async function marketingApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, headers: { ...apiHeaders(init?.body !== undefined), ...init?.headers } });
  if (!response.ok) { const data = await response.json().catch(() => null); throw new Error(data?.error || "Something went wrong"); }
  return response.status === 204 ? undefined as T : response.json();
}
export async function uploadMarketingImage(file: File): Promise<string> {
  const contentType = file.type;
  const intent = await marketingApi<{ uploadURL: string; objectPath: string; finalizeToken: string }>("/storage/uploads/request-url", { method: "POST", body: JSON.stringify({ name: file.name, size: file.size, contentType }) });
  const uploaded = await fetch(intent.uploadURL, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
  if (!uploaded.ok) {
    const data = await uploaded.json().catch(() => null) as { error?: unknown } | null;
    const detail = typeof data?.error === "string" && data.error.length <= 200 ? data.error : null;
    throw new Error(detail || `Image upload failed (${uploaded.status})`);
  }
  await marketingApi("/storage/uploads/finalize", { method: "POST", body: JSON.stringify({ objectPath: intent.objectPath, finalizeToken: intent.finalizeToken }) });
  return intent.objectPath;
}
export function privateImageUrl(path?: string | null) { return path ? `/api/storage/objects/${path.replace(/^\/objects\//, "")}` : ""; }
