import crypto from "crypto";

export const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

interface UploadIntent {
  userId: string;
  objectPath: string;
  expiresAt: number;
}

const uploadIntents = new Map<string, UploadIntent>();
const INTENT_TTL_MS = 15 * 60 * 1000;

export function validateUpload(size: number, contentType: string): string | null {
  if (size > MAX_UPLOAD_SIZE_BYTES) {
    return `File too large. Maximum upload size is ${MAX_UPLOAD_SIZE_BYTES / 1024 / 1024} MB.`;
  }
  if (!ALLOWED_UPLOAD_MIME_TYPES.has(contentType)) {
    return `Unsupported file type "${contentType}". Allowed: ${[...ALLOWED_UPLOAD_MIME_TYPES].join(", ")}.`;
  }
  return null;
}

export function issueUploadIntent(userId: string, objectPath: string): string {
  const token = crypto.randomUUID();
  uploadIntents.set(token, { userId, objectPath, expiresAt: Date.now() + INTENT_TTL_MS });
  return token;
}

export function consumeUploadIntent(token: string, userId: string, objectPath: string): UploadIntent | null {
  const intent = uploadIntents.get(token);
  if (!intent) return null;
  uploadIntents.delete(token);
  if (Date.now() > intent.expiresAt || intent.userId !== userId || intent.objectPath !== objectPath) return null;
  return intent;
}
