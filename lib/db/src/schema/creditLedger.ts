import { pgTable, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/** Append-only audit events. Balances remain on users for backward compatibility. */
export const creditLedgerTable = pgTable("credit_ledger", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  projectId: text("project_id"),
  attempt: integer("attempt").notNull().default(1),
  kind: text("kind").notNull(),
  amount: integer("amount").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, table => [uniqueIndex("credit_ledger_project_kind_attempt_unique").on(table.projectId, table.kind, table.attempt)]);
