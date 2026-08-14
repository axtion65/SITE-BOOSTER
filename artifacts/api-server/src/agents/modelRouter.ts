export type AgentRole =
  | "research"
  | "strategist"
  | "hooks"
  | "writer"
  | "judge"
  | "rewriter"
  | "factcheck"
  | "qa"
  | "schemaRepair";
export type Reasoning = "low" | "medium" | "high";
const defaults: Record<AgentRole, { model: string; reasoning?: Reasoning }> = {
  research: { model: "gpt-5.6-terra", reasoning: "medium" },
  strategist: { model: "gpt-5.6-sol", reasoning: "high" },
  hooks: { model: "gpt-5.6-sol", reasoning: "medium" },
  writer: { model: "gpt-5.6-sol" },
  judge: { model: "gpt-5.6-sol", reasoning: "high" },
  rewriter: { model: "gpt-5.6-sol", reasoning: "high" },
  factcheck: { model: "gpt-5.6-terra", reasoning: "medium" },
  qa: { model: "gpt-5.6-sol", reasoning: "high" },
  schemaRepair: { model: "gpt-5.6-terra", reasoning: "low" },
};
const envKeys: Record<AgentRole, string> = {
  research: "RESEARCH",
  strategist: "STRATEGIST",
  hooks: "HOOKS",
  writer: "WRITER",
  judge: "JUDGE",
  rewriter: "REWRITER",
  factcheck: "FACTCHECK",
  qa: "QA",
  schemaRepair: "SCHEMA_REPAIR",
};
export class AgentModelRouter {
  get(role: AgentRole) {
    const suffix = envKeys[role];
    const fallback = defaults[role];
    return {
      model: process.env[`QUAE_AGENT_MODEL_${suffix}`] || fallback.model,
      reasoning:
        (process.env[`QUAE_AGENT_REASONING_${suffix}`] as
          Reasoning | undefined) || fallback.reasoning,
    };
  }
}
