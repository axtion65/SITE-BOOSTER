-- Bind every campaign render to the approved production handoff and make submission retry-safe.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS campaign_run_id TEXT REFERENCES campaign_runs(id) ON DELETE RESTRICT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS campaign_video_brief_id TEXT REFERENCES campaign_video_briefs(id) ON DELETE RESTRICT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS mockup_project_id TEXT REFERENCES mockup_projects(id) ON DELETE RESTRICT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS mockup_version_id TEXT REFERENCES mockup_versions(id) ON DELETE RESTRICT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quality_status TEXT NOT NULL DEFAULT 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS projects_user_idempotency_unique
  ON projects(user_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS projects_campaign_assets_idx
  ON projects(campaign_id,campaign_run_id,campaign_video_brief_id,created_at DESC);
