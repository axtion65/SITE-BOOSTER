import { apiHeaders, privateImageUrl } from "./marketing-api";

export type MockupVersion = {
  id: string;
  version_number: number;
  object_path?: string | null;
  status: string;
  created_at?: string;
};

export type MockupProject = {
  id: string;
  product_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  versions: MockupVersion[];
};

export function studioMockupUrl(projectId: string) {
  return `/studio/mockups?projectId=${encodeURIComponent(projectId)}`;
}

type DownloadLink = {
  href: string;
  download: string;
  click(): void;
};

export type MockupDownloadRuntime = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  headers(): HeadersInit;
  createObjectUrl(blob: Blob): string;
  revokeObjectUrl(url: string): void;
  createLink(): DownloadLink;
};

function browserDownloadRuntime(): MockupDownloadRuntime {
  return {
    fetch: globalThis.fetch.bind(globalThis),
    headers: () => apiHeaders(false),
    createObjectUrl: blob => URL.createObjectURL(blob),
    revokeObjectUrl: url => URL.revokeObjectURL(url),
    createLink: () => document.createElement("a"),
  };
}

export async function downloadMockupVersion(
  version: MockupVersion,
  productName: string,
  runtime: MockupDownloadRuntime = browserDownloadRuntime(),
) {
  if (!version.object_path) throw new Error("This version does not have a saved image");
  const image = await runtime.fetch(privateImageUrl(version.object_path), {
    headers: runtime.headers(),
  });
  if (!image.ok) throw new Error("The image could not be downloaded");
  const blobUrl = runtime.createObjectUrl(await image.blob());
  const link = runtime.createLink();
  link.href = blobUrl;
  link.download = `${productName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "mockup"}-v${version.version_number}`;
  link.click();
  runtime.revokeObjectUrl(blobUrl);
}
