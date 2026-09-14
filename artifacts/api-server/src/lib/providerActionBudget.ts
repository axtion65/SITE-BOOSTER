import type { RequestHandler, Response } from "express";
import { FixedWindowRateLimiter, type RateLimitResult } from "./rateLimit";

export const PROVIDER_ACTIONS_PER_ACCOUNT_PER_HOUR = 20;
export const PROVIDER_ACTIONS_GLOBAL_PER_HOUR = 100;
const ONE_HOUR = 60 * 60 * 1_000;

export type ProviderActionBudgetResult = RateLimitResult & {
  scope: "account" | "global";
};

export class ProviderActionBudget {
  private readonly perAccount: FixedWindowRateLimiter;
  private readonly global: FixedWindowRateLimiter;

  constructor(
    accountLimit = PROVIDER_ACTIONS_PER_ACCOUNT_PER_HOUR,
    globalLimit = PROVIDER_ACTIONS_GLOBAL_PER_HOUR,
    windowMs = ONE_HOUR,
  ) {
    this.perAccount = new FixedWindowRateLimiter(accountLimit, windowMs);
    this.global = new FixedWindowRateLimiter(globalLimit, windowMs, 1);
  }

  consume(accountId: string, now = Date.now()): ProviderActionBudgetResult {
    const account = this.perAccount.consume(accountId, now);
    if (!account.allowed) return { ...account, scope: "account" };

    const global = this.global.consume("global", now);
    return { ...global, scope: "global" };
  }
}

type ResolveUserId = (authorization: string | undefined) => Promise<string | null>;

const productionBudget = new ProviderActionBudget();

function rejectOverBudget(res: Response, result: ProviderActionBudgetResult) {
  res.setHeader("RateLimit-Limit", String(result.limit));
  res.setHeader("RateLimit-Remaining", String(result.remaining));
  res.setHeader("RateLimit-Reset", String(result.retryAfterSeconds));
  res.setHeader("Retry-After", String(result.retryAfterSeconds));
  res.status(429).json({
    error: "AI generation limit reached. Please wait before starting more AI work.",
  });
}

export function createProviderActionRateLimit(
  resolveUserId: ResolveUserId,
  budget = productionBudget,
  now: () => number = Date.now,
): RequestHandler {
  return async (req, res, next) => {
    const userId = await resolveUserId(req.headers.authorization);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const result = budget.consume(userId, now());
    res.setHeader("RateLimit-Limit", String(result.limit));
    res.setHeader("RateLimit-Remaining", String(result.remaining));
    res.setHeader("RateLimit-Reset", String(result.retryAfterSeconds));
    if (!result.allowed) {
      rejectOverBudget(res, result);
      return;
    }

    res.locals.providerActionUserId = userId;
    next();
  };
}
