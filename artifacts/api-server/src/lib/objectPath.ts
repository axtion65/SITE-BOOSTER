/**
 * Normalize database-safe object entity paths without consulting storage.
 * Only relative keys owned through application relationships are accepted;
 * absolute URLs must be handled by the upload-finalization flow instead.
 */
export function normalizeInternalObjectPath(path: unknown): string | null {
  if (typeof path !== "string") return null;
  const value = path.trim();
  let key: string;
  if (value.startsWith("/api/storage/objects/")) key = value.slice("/api/storage/objects/".length);
  else if (value.startsWith("/objects/")) key = value.slice("/objects/".length);
  else if (value.startsWith("uploads/")) key = value;
  else return null;
  if (!key || key.startsWith("/") || key.includes("..") || key.includes("\\") || /[?#]/.test(key)) return null;
  return `/objects/${key}`;
}
