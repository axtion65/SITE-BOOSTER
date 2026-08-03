import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const emailQueueTable = pgTable("email_queue", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  to: text("to").notNull(),
  toName: text("to_name").notNull().default(""),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  status: text("status").notNull().default("pending"), // pending | processing | sent | failed
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  sentAt: timestamp("sent_at"),
});

export type EmailQueueRow = typeof emailQueueTable.$inferSelect;
