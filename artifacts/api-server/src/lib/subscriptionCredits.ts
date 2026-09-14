import { creditLedgerTable, db, usersTable } from "@workspace/db";
import { PLAN_BY_SLUG, isPlanSlug } from "@workspace/plans";
import { eq, sql } from "drizzle-orm";
import {
  isEntitledSubscriptionStatus, nextMonthlyAnniversary, shouldGrantPlanAllowance,
  shouldRefreshPaidPlanAllowance, type PaidSubscriptionSnapshot,
} from "./subscriptionCreditPolicy";

export type AllowanceGrantReason = "subscription_change" | "monthly_refresh" | null;

type DbUser = typeof usersTable.$inferSelect;

async function lockUser(tx: any, userId: string): Promise<DbUser | null> {
  await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
  const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, userId));
  return user ?? null;
}

async function recordAllowance(tx: any, user: typeof usersTable.$inferSelect, balanceAfter: number, createdAt: Date) {
  await tx.insert(creditLedgerTable).values({
    userId: user.id, projectId: null, attempt: 1, kind: "plan_allowance",
    amount: balanceAfter - user.credits, balanceAfter, createdAt,
  });
}

export async function applyPaidSubscriptionSnapshot(
  userId: string, snapshot: PaidSubscriptionSnapshot, now = new Date(),
): Promise<{ user: typeof usersTable.$inferSelect; grantReason: AllowanceGrantReason } | null> {
  return db.transaction(async (tx) => {
    const user = await lockUser(tx, userId);
    if (!user) return null;

    // A different subscription may replace only the exact ended subscription
    // verified by the caller. Recheck under the lock in case another event won.
    if (user.stripeSubscriptionId && user.stripeSubscriptionId !== snapshot.subscriptionId &&
      user.stripeSubscriptionId !== snapshot.replacesSubscriptionId) {
      return { user, grantReason: null };
    }

    if (!isEntitledSubscriptionStatus(snapshot.status)) {
      const [updated] = await tx.update(usersTable).set({
        stripeCustomerId: snapshot.customerId, subscriptionStatus: snapshot.status,
        billingInterval: snapshot.billingInterval, updatedAt: now,
      }).where(eq(usersTable.id, userId)).returning();
      return { user: updated ?? user, grantReason: null };
    }

    const allowance = PLAN_BY_SLUG[snapshot.plan].credits;
    if (user.isAdmin) {
      const [updated] = await tx.update(usersTable).set({
        stripeCustomerId: snapshot.customerId, stripeSubscriptionId: snapshot.subscriptionId,
        plan: snapshot.plan, subscriptionStatus: snapshot.status, billingInterval: snapshot.billingInterval, updatedAt: now,
      }).where(eq(usersTable.id, userId)).returning();
      return { user: updated ?? user, grantReason: null };
    }

    if (shouldGrantPlanAllowance(user, snapshot)) {
      const sameSubscription = user.stripeSubscriptionId === snapshot.subscriptionId;
      const candidateAnchor = sameSubscription ? now : snapshot.anchorAt;
      const anchorAt = Number.isFinite(candidateAnchor.getTime()) ? candidateAnchor : now;
      const [updated] = await tx.update(usersTable).set({
        stripeCustomerId: snapshot.customerId, stripeSubscriptionId: snapshot.subscriptionId, plan: snapshot.plan,
        credits: allowance, subscriptionStatus: snapshot.status, billingInterval: snapshot.billingInterval,
        creditCycleAnchorAt: anchorAt, creditRefreshAt: nextMonthlyAnniversary(anchorAt, now), updatedAt: now,
      }).where(eq(usersTable.id, userId)).returning();
      if (!updated) return null;
      await recordAllowance(tx, user, allowance, now);
      return { user: updated, grantReason: "subscription_change" };
    }

    if (!user.creditCycleAnchorAt || !user.creditRefreshAt) {
      const anchorAt = now;
      const [updated] = await tx.update(usersTable).set({
        stripeCustomerId: snapshot.customerId, stripeSubscriptionId: snapshot.subscriptionId, plan: snapshot.plan,
        subscriptionStatus: snapshot.status, billingInterval: snapshot.billingInterval, creditCycleAnchorAt: anchorAt,
        creditRefreshAt: nextMonthlyAnniversary(anchorAt, now), updatedAt: now,
      }).where(eq(usersTable.id, userId)).returning();
      return { user: updated ?? user, grantReason: null };
    }

    if (user.creditRefreshAt <= now) {
      const [updated] = await tx.update(usersTable).set({
        stripeCustomerId: snapshot.customerId, stripeSubscriptionId: snapshot.subscriptionId, plan: snapshot.plan,
        credits: allowance, subscriptionStatus: snapshot.status, billingInterval: snapshot.billingInterval,
        creditRefreshAt: nextMonthlyAnniversary(user.creditCycleAnchorAt, now), updatedAt: now,
      }).where(eq(usersTable.id, userId)).returning();
      if (!updated) return null;
      await recordAllowance(tx, user, allowance, now);
      return { user: updated, grantReason: "monthly_refresh" };
    }

    const [updated] = await tx.update(usersTable).set({
      stripeCustomerId: snapshot.customerId, stripeSubscriptionId: snapshot.subscriptionId, plan: snapshot.plan,
      subscriptionStatus: snapshot.status, billingInterval: snapshot.billingInterval, updatedAt: now,
    }).where(eq(usersTable.id, userId)).returning();
    return { user: updated ?? user, grantReason: null };
  });
}

export async function refreshPaidPlanAllowance(userId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const user = await lockUser(tx, userId);
    if (!user || !shouldRefreshPaidPlanAllowance(user, now)) return user;
    if (!isPlanSlug(user.plan) || user.plan === "free") return user;
    const paidPlan = user.plan;

    if (!user.creditCycleAnchorAt || !user.creditRefreshAt) {
      const anchorAt = now;
      const [seeded] = await tx.update(usersTable).set({
        creditCycleAnchorAt: anchorAt, creditRefreshAt: nextMonthlyAnniversary(anchorAt, now), updatedAt: now,
      }).where(eq(usersTable.id, userId)).returning();
      return seeded ?? user;
    }

    const allowance = PLAN_BY_SLUG[paidPlan].credits;
    const [updated] = await tx.update(usersTable).set({
      credits: allowance, creditRefreshAt: nextMonthlyAnniversary(user.creditCycleAnchorAt, now), updatedAt: now,
    }).where(eq(usersTable.id, userId)).returning();
    if (!updated) return user;
    await recordAllowance(tx, user, allowance, now);
    return updated;
  });
}
