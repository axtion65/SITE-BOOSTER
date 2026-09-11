ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_cycle_anchor_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_refresh_at TIMESTAMPTZ;

-- Existing paid users keep their current balance. Their first authenticated
-- request seeds a monthly clock without granting another allowance.
