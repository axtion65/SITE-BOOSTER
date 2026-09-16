const ACTIVE_CAMPAIGN_RUN_STATUSES = new Set(["queued", "running"]);

export function shouldPollCampaignWorkspace(status?: string | null): boolean {
  return Boolean(status && ACTIVE_CAMPAIGN_RUN_STATUSES.has(status));
}
