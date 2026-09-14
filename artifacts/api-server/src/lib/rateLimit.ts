import { createHash } from "node:crypto";
import type { Request, RequestHandler } from "express";

type Bucket = { count: number; resetAt: number };

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxEntries = 5_000,
  ) {
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new RangeError("limit must be a positive integer");
    if (!Number.isSafeInteger(windowMs) || windowMs < 1)
      throw new RangeError("windowMs must be a positive integer");
  }

  consume(key: string, now = Date.now()): RateLimitResult {
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (!bucket && this.buckets.size >= this.maxEntries) this.prune(now);
      if (!bucket && this.buckets.size >= this.maxEntries) {
        const oldestKey = this.buckets.keys().next().value;
        if (oldestKey) this.buckets.delete(oldestKey);
      }
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(key, bucket);
    }

    bucket.count = Math.min(bucket.count + 1, this.limit + 1);
    return {
      allowed: bucket.count <= this.limit,
      limit: this.limit,
      remaining: Math.max(0, this.limit - bucket.count),
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
    };
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

function forwardedClientAddress(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded?.split(",")[0];
  return first?.trim() || req.ip || req.socket.remoteAddress || "unknown";
}

export function emailRateLimitIdentity(req: Request): string {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === "string" && email.trim()
    ? `email:${email.trim().toLowerCase()}`
    : `client:${forwardedClientAddress(req)}`;
}

function opaqueIdentity(scope: string, identity: string): string {
  return createHash("sha256")
    .update(scope)
    .update("\0")
    .update(identity)
    .digest("base64url");
}

type RateLimitOptions = {
  scope: string;
  limit: number;
  globalLimit: number;
  windowMs: number;
  identity?: (req: Request) => string;
  now?: () => number;
};

export function createRateLimitMiddleware(
  options: RateLimitOptions,
): RequestHandler {
  const perIdentity = new FixedWindowRateLimiter(
    options.limit,
    options.windowMs,
  );
  const global = new FixedWindowRateLimiter(
    options.globalLimit,
    options.windowMs,
    1,
  );
  const identity = options.identity ?? forwardedClientAddress;
  const now = options.now ?? Date.now;

  return (req, res, next) => {
    const currentTime = now();
    const globalResult = global.consume("global", currentTime);
    const identityResult = perIdentity.consume(
      opaqueIdentity(options.scope, identity(req)),
      currentTime,
    );
    const blocked = !globalResult.allowed
      ? globalResult
      : !identityResult.allowed
        ? identityResult
        : null;
    const visible = blocked ?? identityResult;

    res.setHeader("RateLimit-Limit", String(visible.limit));
    res.setHeader("RateLimit-Remaining", String(visible.remaining));
    res.setHeader("RateLimit-Reset", String(visible.retryAfterSeconds));
    if (!blocked) {
      next();
      return;
    }

    res.setHeader("Retry-After", String(blocked.retryAfterSeconds));
    res
      .status(429)
      .json({ error: "Too many requests. Please wait and try again." });
  };
}
