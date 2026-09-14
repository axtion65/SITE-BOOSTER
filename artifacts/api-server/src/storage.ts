import { db, usersTable } from "@workspace/db";
import { PLAN_BY_SLUG } from "@workspace/plans";
import { and, eq, sql } from "drizzle-orm";

export class Storage {
  async getUser(id: string) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    return user ?? null;
  }

  async getUserByStripeCustomerId(customerId: string) {
    const [user] = await db.select().from(usersTable)
      .where(eq(usersTable.stripeCustomerId, customerId));
    return user ?? null;
  }

  async endUserSubscription(userId: string, subscriptionId: string, status: string) {
    // Keep the identity check in the UPDATE so a replacement subscription that
    // arrives after the webhook's customer lookup cannot lose its entitlement.
    const [user] = await db.update(usersTable).set({
      stripeSubscriptionId: null,
      plan: "free",
      credits: PLAN_BY_SLUG.free.credits,
      subscriptionStatus: status,
      billingInterval: null,
      creditCycleAnchorAt: null,
      creditRefreshAt: null,
      updatedAt: new Date(),
    }).where(and(
      eq(usersTable.id, userId),
      eq(usersTable.stripeSubscriptionId, subscriptionId),
    )).returning();
    return user ?? null;
  }

  async updateUserStripeInfo(userId: string, info: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string | null;
    plan?: string;
    credits?: number;
    subscriptionStatus?: string | null;
    billingInterval?: string | null;
    creditCycleAnchorAt?: Date | null;
    creditRefreshAt?: Date | null;
  }) {
    const [user] = await db.update(usersTable)
      .set({ ...info, updatedAt: new Date() })
      .where(eq(usersTable.id, userId))
      .returning();
    return user;
  }
}

export const storage = new Storage();
