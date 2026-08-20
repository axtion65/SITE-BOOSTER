-- Durable, non-destructive campaign association for videos created from an approved campaign.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS projects_campaign_id_idx ON projects(campaign_id);
