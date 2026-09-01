-- One durable owner prepares narration for each render attempt. The measured
-- voiceover may be reused after an explicit duration upgrade, before any paid
-- visual provider work begins.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS voiceover_script_hash TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS preparation_token TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS preparation_lease_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS projects_video_preparation_lease_idx
  ON projects(status, preparation_lease_expires_at)
  WHERE status = 'preparing' AND production_plan IS NULL;
