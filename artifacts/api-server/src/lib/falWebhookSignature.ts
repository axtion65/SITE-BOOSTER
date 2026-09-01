import { createHash, createPublicKey, verify, webcrypto } from "node:crypto";

const FAL_JWKS_URL = "https://rest.fal.ai/.well-known/jwks.json";
const JWKS_CACHE_MS = 6 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_SECONDS = 300;

type FalJwk = webcrypto.JsonWebKey & { x?: string };
type CachedKeys = { keys: FalJwk[]; expiresAt: number };

let cache: CachedKeys | null = null;

export type FalWebhookHeaders = {
  requestId: string;
  userId: string;
  timestamp: string;
  signature: string;
};

export function readFalWebhookHeaders(
  headers: Record<string, string | string[] | undefined>,
): FalWebhookHeaders | null {
  const read = (name: string): string | undefined => {
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const requestId = read("x-fal-webhook-request-id");
  const userId = read("x-fal-webhook-user-id");
  const timestamp = read("x-fal-webhook-timestamp");
  const signature = read("x-fal-webhook-signature");
  return requestId && userId && timestamp && signature
    ? { requestId, userId, timestamp, signature }
    : null;
}

async function getFalJwks(fetchImpl: typeof fetch, nowMs: number): Promise<FalJwk[]> {
  if (cache && cache.expiresAt > nowMs) return cache.keys;
  const response = await fetchImpl(FAL_JWKS_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`fal JWKS fetch failed: ${response.status}`);
  const body = await response.json() as { keys?: FalJwk[] };
  const keys = Array.isArray(body.keys) ? body.keys.filter((key) => typeof key.x === "string") : [];
  if (keys.length === 0) throw new Error("fal JWKS contains no signing keys");
  cache = { keys, expiresAt: nowMs + JWKS_CACHE_MS };
  return keys;
}

export async function verifyFalWebhookSignature(
  rawBody: Buffer,
  headers: FalWebhookHeaders,
  dependencies: { fetch?: typeof fetch; nowMs?: number; keys?: FalJwk[] } = {},
): Promise<boolean> {
  const nowMs = dependencies.nowMs ?? Date.now();
  const timestamp = Number(headers.timestamp);
  if (!Number.isInteger(timestamp)) return false;
  if (Math.abs(Math.floor(nowMs / 1000) - timestamp) > MAX_CLOCK_SKEW_SECONDS) return false;
  if (!/^[a-f0-9]+$/i.test(headers.signature) || headers.signature.length % 2 !== 0) return false;

  const digest = createHash("sha256").update(rawBody).digest("hex");
  const message = Buffer.from(
    [headers.requestId, headers.userId, headers.timestamp, digest].join("\n"),
    "utf8",
  );
  const signature = Buffer.from(headers.signature, "hex");
  const keys = dependencies.keys ?? await getFalJwks(dependencies.fetch ?? fetch, nowMs);

  for (const jwk of keys) {
    try {
      const key = createPublicKey({ key: jwk, format: "jwk" });
      if (verify(null, message, key, signature)) return true;
    } catch {
      // Ignore malformed or unsupported individual keys and try the next key.
    }
  }
  return false;
}

export function clearFalJwksCacheForTests(): void {
  cache = null;
}
