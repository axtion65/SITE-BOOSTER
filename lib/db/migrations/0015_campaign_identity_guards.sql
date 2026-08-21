-- Preserve legacy rows while binding every new website import to an explicit
-- owned business. The nullable column avoids rewriting existing customer data.
ALTER TABLE website_import_drafts
  ADD COLUMN IF NOT EXISTS business_id TEXT REFERENCES businesses(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS website_import_business_idx
  ON website_import_drafts(user_id, business_id, updated_at DESC);

-- Enforce the business boundary in the database as well as in API queries.
CREATE UNIQUE INDEX IF NOT EXISTS businesses_owner_identity_unique
  ON businesses(id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_business_identity_unique
  ON campaigns(id, business_id);

DO $$ BEGIN
  ALTER TABLE campaigns ADD CONSTRAINT campaigns_business_owner_fk
    FOREIGN KEY (business_id, user_id) REFERENCES businesses(id, user_id) ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE website_import_drafts ADD CONSTRAINT website_import_business_owner_fk
    FOREIGN KEY (business_id, user_id) REFERENCES businesses(id, user_id) ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
