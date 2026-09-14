import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const stripeWebhookEventsTable = pgTable(
  "stripe_webhook_events",
  {
    eventId: text("event_id").primaryKey(),
    eventType: text("event_type").notNull(),
    status: text("status").notNull().default("processing"),
    attempts: integer("attempts").notNull().default(1),
    lastError: text("last_error"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("stripe_webhook_events_status_updated_idx").on(
      table.status,
      table.updatedAt,
    ),
  ],
);

export type StripeWebhookEvent = typeof stripeWebhookEventsTable.$inferSelect;
