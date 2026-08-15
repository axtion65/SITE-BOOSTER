ALTER TABLE brand_models
  ADD COLUMN IF NOT EXISTS replacement_pending_model_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
