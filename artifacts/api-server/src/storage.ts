import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

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

  async updateUserStripeInfo(userId: string, info: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string | null;
    plan?: string;
    credits?: number;
    subscriptionStatus?: string | null;
    billingInterval?: string | null;
  }) {
    const [user] = await db.update(usersTable)
      .set({ ...info, updatedAt: new Date() })
      .where(eq(usersTable.id, userId))
      .returning();
    return user;
  }
}

export const storage = new Storage();
