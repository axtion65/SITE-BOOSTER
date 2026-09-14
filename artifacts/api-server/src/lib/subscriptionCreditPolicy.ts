import { isPlanSlug, type PaidPlanSlug } from "@workspace/plans";

export interface PaidSubscriptionSnapshot {
  customerId: string;
  subscriptionId: string;
  /** Exact previous subscription confirmed terminal by Stripe before replacement. */
  replacesSubscriptionId?: string;
  plan: PaidPlanSlug;
  status: string;
  billingInterval: string | null;
  anchorAt: Date;
}

export interface AllowanceState {
  plan: string;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  creditCycleAnchorAt: Date | null;
  creditRefreshAt: Date | null;
  isAdmin: boolean;
}

export function isEntitledSubscriptionStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

function monthlyAnniversary(anchor: Date, monthOffset: number): Date {
  const totalMonths = anchor.getUTCFullYear() * 12 + anchor.getUTCMonth() + monthOffset;
  const year = Math.floor(totalMonths / 12);
  const month = totalMonths % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(anchor.getUTCDate(), lastDay);
  return new Date(Date.UTC(
    year, month, day,
    anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds(),
  ));
}

export function nextMonthlyAnniversary(anchor: Date, after: Date): Date {
  if (!Number.isFinite(anchor.getTime()) || !Number.isFinite(after.getTime())) {
    throw new Error("Credit-cycle dates must be valid");
  }
  const rawMonths = (after.getUTCFullYear() - anchor.getUTCFullYear()) * 12
    + (after.getUTCMonth() - anchor.getUTCMonth());
  const offset = Math.max(1, rawMonths);
  const candidate = monthlyAnniversary(anchor, offset);
  return candidate <= after ? monthlyAnniversary(anchor, offset + 1) : candidate;
}

export function shouldGrantPlanAllowance(current: AllowanceState, snapshot: PaidSubscriptionSnapshot): boolean {
  if (current.isAdmin || !isEntitledSubscriptionStatus(snapshot.status)) return false;
  return current.plan !== snapshot.plan || current.stripeSubscriptionId !== snapshot.subscriptionId;
}

export function shouldRefreshPaidPlanAllowance(current: AllowanceState, now = new Date()): boolean {
  if (current.isAdmin || !isPlanSlug(current.plan) || current.plan === "free") return false;
  if (!isEntitledSubscriptionStatus(current.subscriptionStatus)) return false;
  if (!current.creditCycleAnchorAt || !current.creditRefreshAt) return true;
  return current.creditRefreshAt <= now;
}
