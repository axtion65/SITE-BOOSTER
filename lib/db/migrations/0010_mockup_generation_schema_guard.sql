-- Additive production guard for the complete durable generation request path.
-- Existing projects, versions and assets are preserved.
ALTER TABLE mockup_projects ADD COLUMN IF NOT EXISTS creative_direction JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE mockup_projects ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE mockup_projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE mockup_versions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE mockup_versions ADD COLUMN IF NOT EXISTS creation_path TEXT;
ALTER TABLE mockup_versions ADD COLUMN IF NOT EXISTS brand_model_id TEXT REFERENCES brand_models(id) ON DELETE SET NULL;
ALTER TABLE mockup_versions ADD COLUMN IF NOT EXISTS product_reference_paths JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE mockup_versions ADD COLUMN IF NOT EXISTS job_stage TEXT;
ALTER TABLE mockup_versions ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ;
ALTER TABLE mockup_versions ADD COLUMN IF NOT EXISTS lease_owner TEXT;
ALTER TABLE mockup_versions ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;
ALTER TABLE mockup_versions ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mockup_versions ADD COLUMN IF NOT EXISTS provider_output_url TEXT;
ALTER TABLE mockup_versions ADD COLUMN IF NOT EXISTS provider_output_content_type TEXT;
ALTER TABLE mockup_versions ADD COLUMN IF NOT EXISTS provider_output_width INTEGER;
ALTER TABLE mockup_versions ADD COLUMN IF NOT EXISTS provider_output_height INTEGER;
ALTER TABLE mockup_versions ADD COLUMN IF NOT EXISTS failure_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS mockup_versions_project_idempotency_unique
  ON mockup_versions(mockup_project_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
