import { apiHeaders } from "./marketing-api";

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

export async function downloadMockupVersion(version: MockupVersion, productName: string) {
  if (!version.object_path) throw new Error("This version does not have a saved image");
  const key = version.object_path.replace(/^\/api\/storage\/objects\//, "").replace(/^\/objects\//, "");
  const signed = await fetch(`/api/storage/object-signed-url/${key}`, { headers: apiHeaders(false) });
  if (!signed.ok) throw new Error("The secure download could not be prepared");
  const { url } = await signed.json() as { url: string };
  const image = await fetch(url);
  if (!image.ok) throw new Error("The image could not be downloaded");
  const blobUrl = URL.createObjectURL(await image.blob());
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = `${productName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "mockup"}-v${version.version_number}`;
  link.click();
  URL.revokeObjectURL(blobUrl);
}
