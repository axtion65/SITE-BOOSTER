# Campaign assets production handoff

Phase 2 keeps the existing `campaigns`, `campaign_runs`, `mockup_projects`,
`mockup_versions`, and Creative `projects` records authoritative. The smallest
additive relationship is an append-only `campaign_asset_selections` record. It
binds one approved campaign/run and its owner/business to the exact owned
mockup project/version; a partial unique index permits one current selection
while retaining replaced selections as history.

`campaign_video_briefs` is the preparation boundary. It is an idempotently
updated, server-derived snapshot keyed by campaign and approved run. It records
the selected asset and explicit render intent, but does not create a Creative
project, construct a provider, debit credits, or start generation. Creative
continues to own real video projects. A later, explicit customer confirmation
may use the brief to create a project through the existing protected render
route.

All reads and writes join through the authenticated campaign owner and business.
Campaign/run, product, and visual identifiers carried in browser URLs are only
navigation hints and are revalidated on the server.
