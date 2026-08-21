ALTER TABLE projects ADD COLUMN IF NOT EXISTS render_intent TEXT NOT NULL DEFAULT 'create_new';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_asset_id TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS credit_charge INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('legacy_backfill','plan_allowance','bonus','purchased','charge','refund','admin_adjustment')),
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_project_kind_unique ON credit_ledger(project_id, kind);

-- Preserve every balance. Snapshot existing accounts rather than trying to infer
-- whether historical value was allowance, legacy, bonus, purchase, or refund.
INSERT INTO credit_ledger (id,user_id,kind,amount,balance_after)
SELECT gen_random_uuid()::text,id,'legacy_backfill',credits,credits FROM users
WHERE NOT EXISTS (SELECT 1 FROM credit_ledger l WHERE l.user_id=users.id)
  AND credits >= 0;
