import { db, stripeWebhookEventsTable } from "@workspace/db";
import { and, eq, ne, sql } from "drizzle-orm";
import { safeErrorMetadata } from "./safeErrorMetadata";

function safeErrorMessage(error: unknown): string {
  return JSON.stringify(safeErrorMetadata(error));
}

export async function recordStripeWebhookAttempt(
  eventId: string,
  eventType: string,
): Promise<"process" | "already_succeeded"> {
  const now = new Date();
  const [event] = await db
    .insert(stripeWebhookEventsTable)
    .values({ eventId, eventType, receivedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: stripeWebhookEventsTable.eventId,
      set: {
        eventType,
        attempts: sql`${stripeWebhookEventsTable.attempts} + 1`,
        status: sql`CASE WHEN ${stripeWebhookEventsTable.status} = 'succeeded' THEN 'succeeded' ELSE 'processing' END`,
        lastError: sql`CASE WHEN ${stripeWebhookEventsTable.status} = 'succeeded' THEN ${stripeWebhookEventsTable.lastError} ELSE NULL END`,
        processedAt: sql`CASE WHEN ${stripeWebhookEventsTable.status} = 'succeeded' THEN ${stripeWebhookEventsTable.processedAt} ELSE NULL END`,
        updatedAt: now,
      },
    })
    .returning({ status: stripeWebhookEventsTable.status });

  return event?.status === "succeeded" ? "already_succeeded" : "process";
}

export async function recordStripeWebhookSuccess(
  eventId: string,
): Promise<void> {
  const now = new Date();
  await db
    .update(stripeWebhookEventsTable)
    .set({
      status: "succeeded",
      lastError: null,
      processedAt: now,
      updatedAt: now,
    })
    .where(eq(stripeWebhookEventsTable.eventId, eventId));
}

export async function recordStripeWebhookFailure(
  eventId: string,
  error: unknown,
): Promise<void> {
  const now = new Date();
  await db
    .update(stripeWebhookEventsTable)
    .set({
      status: "failed",
      lastError: safeErrorMessage(error),
      processedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(stripeWebhookEventsTable.eventId, eventId),
        ne(stripeWebhookEventsTable.status, "succeeded"),
      ),
    );
}
