export const CAMPAIGN_WORKSPACE_STAGES = [
  "Brief",
  "Strategy",
  "Approval",
  "Visuals",
  "Videos",
  "Ready",
] as const;

type WorkspaceFacts = {
  hasBrief: boolean;
  hasStrategy: boolean;
  approved: boolean;
  visualCount: number;
  videoCount: number;
};

export function campaignWorkspaceProgress(facts: WorkspaceFacts) {
  const complete = {
    Brief: facts.hasBrief,
    Strategy: facts.hasStrategy,
    Approval: facts.approved,
    Visuals: facts.visualCount > 0,
    Videos: facts.videoCount > 0,
    Ready: facts.approved && facts.visualCount > 0 && facts.videoCount > 0,
  };
  return CAMPAIGN_WORKSPACE_STAGES.map((name) => ({
    name,
    complete: complete[name],
  }));
}

export function campaignWorkspaceNextAction(facts: WorkspaceFacts) {
  if (!facts.hasBrief) return "complete_brief" as const;
  if (!facts.hasStrategy) return "create_strategy" as const;
  if (!facts.approved) return "review_campaign" as const;
  if (!facts.visualCount) return "create_visual" as const;
  if (!facts.videoCount) return "create_video" as const;
  return "review_assets" as const;
}
