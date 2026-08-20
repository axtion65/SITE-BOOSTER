CREATE TABLE IF NOT EXISTS website_import_drafts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  source_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  content JSONB NOT NULL,
  approved_campaign_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS website_import_owner_key_unique ON website_import_drafts(user_id,idempotency_key);
CREATE INDEX IF NOT EXISTS website_import_owner_idx ON website_import_drafts(user_id,updated_at DESC);
