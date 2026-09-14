import { apiHeaders } from "./marketing-api";

export type VideoDownloadRuntime = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  headers(): HeadersInit;
  createObjectUrl(blob: Blob): string;
  revokeObjectUrl(url: string): void;
  createLink(): { href: string; download: string; click(): void };
};

function browserDownloadRuntime(): VideoDownloadRuntime {
  return {
    fetch: globalThis.fetch.bind(globalThis),
    headers: () => apiHeaders(false),
    createObjectUrl: blob => URL.createObjectURL(blob),
    revokeObjectUrl: url => URL.revokeObjectURL(url),
    createLink: () => document.createElement("a"),
  };
}

/** Both customer pages use the same owned, authenticated MP4 download. */
export async function downloadProjectVideo(
  projectId: string,
  runtime: VideoDownloadRuntime = browserDownloadRuntime(),
): Promise<void> {
  const response = await runtime.fetch(`/api/projects/${encodeURIComponent(projectId)}/video/download`, {
    headers: runtime.headers(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "Video download is temporarily unavailable.");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] || "quae-video.mp4";
  const url = runtime.createObjectUrl(blob);
  try {
    const anchor = runtime.createLink();
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    runtime.revokeObjectUrl(url);
  }
}
