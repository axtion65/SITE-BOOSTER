-- Resumable Mockup Studio production jobs.
-- Additive and idempotent: no customer rows or assets are removed.
ALTER TABLE mockup_versions ADD COLUMN IF NOT EXISTS job_stage TEXT;
ALTER TABLE mockup_versions ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ;
ALTER TABLE mockup_versions ADD COLUMN IF NOT EXISTS lease_owner TEXT;
ALTER TABLE mockup_versions ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;
ALTER TABLE mockup_versions ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mockup_versions ADD COLUMN IF NOT EXISTS provider_output_url TEXT;
ALTER TABLE mockup_versions ADD COLUMN IF NOT EXISTS provider_output_content_type TEXT;
ALTER TABLE mockup_versions ADD COLUMN IF NOT EXISTS provider_output_width INTEGER;
ALTER TABLE mockup_versions ADD COLUMN IF NOT EXISTS provider_output_height INTEGER;
CREATE INDEX IF NOT EXISTS mockup_versions_production_queue_idx
  ON mockup_versions(status, queued_at)
  WHERE status IN ('queued','provider_processing','saving_asset');
