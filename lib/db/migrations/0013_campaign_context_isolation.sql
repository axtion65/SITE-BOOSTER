ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS website_import_id TEXT REFERENCES website_import_drafts(id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS identity_resolution TEXT CHECK (identity_resolution IN ('imported','saved'));

CREATE TABLE IF NOT EXISTS campaign_visual_attachments (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  mockup_version_id TEXT NOT NULL REFERENCES mockup_versions(id) ON DELETE RESTRICT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, mockup_version_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_visual_one_primary
  ON campaign_visual_attachments(campaign_id) WHERE is_primary;
