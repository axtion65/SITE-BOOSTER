CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  brief JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  approved_run_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS campaigns_user_id_idx ON campaigns(user_id);

CREATE TABLE IF NOT EXISTS campaign_runs (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  run_number INTEGER NOT NULL,
  idempotency_key TEXT,
  context_snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  current_stage TEXT NOT NULL DEFAULT 'research',
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  retry_count INTEGER NOT NULL DEFAULT 0,
  final_result JSONB,
  judge_score NUMERIC(6,2),
  qa_status TEXT,
  candidate_mapping JSONB,
  customer_revision_notes TEXT,
  failure_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(campaign_id, run_number),
  UNIQUE(campaign_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS campaign_runs_queue_idx ON campaign_runs(status, lease_expires_at, queued_at);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_runs_one_active_idx ON campaign_runs(campaign_id) WHERE status IN ('queued','running');

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  campaign_run_id TEXT NOT NULL REFERENCES campaign_runs(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  prompt_version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  configured_model TEXT NOT NULL,
  actual_model TEXT,
  input_hash TEXT NOT NULL,
  structured_output JSONB,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cached_tokens INTEGER,
  estimated_cost_usd NUMERIC(12,6),
  latency_ms INTEGER,
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(campaign_run_id, role, sequence)
);
CREATE INDEX IF NOT EXISTS agent_runs_campaign_run_idx ON agent_runs(campaign_run_id, sequence);

DO $$ BEGIN
  ALTER TABLE campaigns ADD CONSTRAINT campaigns_approved_run_fk FOREIGN KEY (approved_run_id) REFERENCES campaign_runs(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
