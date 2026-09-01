-- Durable full-ad production: voiceover first, independently tracked scene jobs,
-- deterministic assembly, and bounded retry state. Additive and safe on existing rows.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS production_version TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS production_plan JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS voiceover_path TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS voiceover_duration_ms INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS target_duration_seconds INTEGER;

CREATE TABLE IF NOT EXISTS video_render_scenes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  render_attempt INTEGER NOT NULL,
  scene_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','submitting','submitted','archiving','completed','failed')),
  provider_model_id TEXT NOT NULL,
  provider_request_id TEXT,
  provider_token TEXT,
  prompt TEXT NOT NULL,
  narration_text TEXT NOT NULL DEFAULT '',
  source_asset_path TEXT,
  output_path TEXT,
  expected_duration_ms INTEGER NOT NULL CHECK (expected_duration_ms > 0),
  actual_duration_ms INTEGER,
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count BETWEEN 0 AND 1),
  poll_count INTEGER NOT NULL DEFAULT 0 CHECK (poll_count BETWEEN 0 AND 2),
  provider_cost_cents INTEGER,
  failure_code TEXT,
  failure_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS video_render_scenes_project_attempt_index_unique
  ON video_render_scenes(project_id,render_attempt,scene_index);
CREATE UNIQUE INDEX IF NOT EXISTS video_render_scenes_provider_request_unique
  ON video_render_scenes(provider_request_id) WHERE provider_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS video_render_scenes_project_status_idx
  ON video_render_scenes(project_id,render_attempt,status);
