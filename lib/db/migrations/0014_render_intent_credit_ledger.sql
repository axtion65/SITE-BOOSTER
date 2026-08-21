ALTER TABLE projects ADD COLUMN IF NOT EXISTS render_intent TEXT NOT NULL DEFAULT 'create_new';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_asset_id TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS credit_charge INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS render_attempt INTEGER NOT NULL DEFAULT 1;

-- Preserve the exact refundable amount for renders that were already present
-- when this migration was deployed. Admin renders remain uncharged.
UPDATE projects AS p
SET credit_charge = CASE COALESCE(p.rendering_model_id, 'ovi')
  WHEN 'ltx' THEN 15
  WHEN 'ltx-fast' THEN 15
  WHEN 'quae-v1' THEN 30
  WHEN 'ovi' THEN 30
  WHEN 'wan' THEN 200
  WHEN 'kling' THEN 300
  WHEN 'kling-1.6' THEN 300
  WHEN 'veo3' THEN 1500
  ELSE 30
END
FROM users AS u
WHERE p.user_id = u.id AND u.is_admin = FALSE AND p.credit_charge = 0;

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  attempt INTEGER NOT NULL DEFAULT 1,
  kind TEXT NOT NULL CHECK (kind IN ('legacy_backfill','plan_allowance','bonus','purchased','charge','refund','admin_adjustment')),
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE credit_ledger ADD COLUMN IF NOT EXISTS attempt INTEGER NOT NULL DEFAULT 1;
DROP INDEX IF EXISTS credit_ledger_project_kind_unique;
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_project_kind_attempt_unique ON credit_ledger(project_id, kind, attempt);

-- Preserve every balance. Snapshot existing accounts rather than trying to infer
-- whether historical value was allowance, legacy, bonus, purchase, or refund.
INSERT INTO credit_ledger (id,user_id,kind,amount,balance_after)
SELECT gen_random_uuid()::text,id,'legacy_backfill',credits,credits FROM users
WHERE NOT EXISTS (SELECT 1 FROM credit_ledger l WHERE l.user_id=users.id)
  AND credits >= 0;
