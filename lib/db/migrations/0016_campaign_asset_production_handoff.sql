-- Append-only selection history for an approved campaign and an exact owned visual version.
CREATE TABLE IF NOT EXISTS campaign_asset_selections (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  campaign_run_id TEXT NOT NULL REFERENCES campaign_runs(id) ON DELETE RESTRICT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  customer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  mockup_project_id TEXT NOT NULL REFERENCES mockup_projects(id) ON DELETE RESTRICT,
  mockup_version_id TEXT NOT NULL REFERENCES mockup_versions(id) ON DELETE RESTRICT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  idempotency_key TEXT NOT NULL,
  replaced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, campaign_run_id, idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_asset_selections_one_active
  ON campaign_asset_selections(campaign_id, campaign_run_id) WHERE active;
CREATE INDEX IF NOT EXISTS campaign_asset_selections_owner_idx
  ON campaign_asset_selections(customer_id, business_id, campaign_id, created_at DESC);

-- Preserve the Phase 1 primary attachment (or its earliest surviving attachment)
-- as the initial approved-run selection without modifying the old row.
INSERT INTO campaign_asset_selections(
  id,campaign_id,campaign_run_id,business_id,customer_id,
  mockup_project_id,mockup_version_id,idempotency_key,created_at
)
SELECT 'phase1-'||md5(chosen.campaign_id||':'||chosen.mockup_version_id),
  chosen.campaign_id,chosen.approved_run_id,chosen.business_id,chosen.user_id,
  chosen.mockup_project_id,chosen.mockup_version_id,'phase1-migration',chosen.created_at
FROM (
  SELECT c.id campaign_id,c.approved_run_id,c.business_id,c.user_id,
    mp.id mockup_project_id,a.mockup_version_id,a.created_at,
    row_number() OVER (PARTITION BY c.id ORDER BY a.is_primary DESC,a.created_at) position
  FROM campaign_visual_attachments a
  JOIN campaigns c ON c.id=a.campaign_id AND c.approved_run_id IS NOT NULL
  JOIN mockup_versions mv ON mv.id=a.mockup_version_id
  JOIN mockup_projects mp ON mp.id=mv.mockup_project_id
    AND mp.user_id=c.user_id AND mp.business_id=c.business_id
) chosen
WHERE chosen.position=1
ON CONFLICT (campaign_id,campaign_run_id,idempotency_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS campaign_video_briefs (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  campaign_run_id TEXT NOT NULL REFERENCES campaign_runs(id) ON DELETE RESTRICT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  customer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  selection_id TEXT NOT NULL REFERENCES campaign_asset_selections(id) ON DELETE RESTRICT,
  mockup_project_id TEXT NOT NULL REFERENCES mockup_projects(id) ON DELETE RESTRICT,
  mockup_version_id TEXT NOT NULL REFERENCES mockup_versions(id) ON DELETE RESTRICT,
  render_intent TEXT NOT NULL CHECK (render_intent IN ('animate')),
  brief JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, campaign_run_id)
);

-- Refuse to conceal invalid pre-existing campaign attachment relationships.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM campaign_visual_attachments a
    JOIN campaigns c ON c.id=a.campaign_id
    JOIN mockup_versions mv ON mv.id=a.mockup_version_id
    JOIN mockup_projects mp ON mp.id=mv.mockup_project_id
    WHERE mp.user_id<>c.user_id OR mp.business_id<>c.business_id
  ) THEN RAISE EXCEPTION 'Invalid campaign visual attachments require administrator review';
  END IF;
END $$;
