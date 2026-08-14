import { readFile, writeFile } from "node:fs/promises";
import { z } from "@workspace/api-zod";
import { estimatedCost } from "../pricing";
import type { AgentProvider } from "../provider";
import { OpenAIResponsesProvider } from "../provider";
import { hooksOutputSchema, strategyOutputSchema } from "../schemas";
import type { Reasoning } from "../modelRouter";

const evaluationSchema = z.object({
  strategyQuality: z.number().min(0).max(100),
  hookQuality: z.number().min(0).max(100),
  persuasion: z.number().min(0).max(100),
  brandAdherence: z.number().min(0).max(100),
  specificity: z.number().min(0).max(100),
  claimSafety: z.number().min(0).max(100),
  scriptQuality: z.number().min(0).max(100),
  judgeAgreement: z.number().min(0).max(100),
});

export type EvalConfiguration = {
  name: string;
  strategist: { model: string; reasoning?: Reasoning };
  hooks: { model: string; reasoning?: Reasoning };
  judge: { model: string; reasoning?: Reasoning };
};

export async function evaluateFixture(
  provider: AgentProvider,
  fixture: unknown,
  configuration: EvalConfiguration,
) {
  const calls: Array<{
    model: string;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    estimatedCost: number | null;
  }> = [];
  const run = async <T>(
    role: "strategist" | "hooks" | "qa",
    config: { model: string; reasoning?: Reasoning },
    schema: z.ZodType<T>,
    system: string,
    data: unknown,
  ) => {
    const started = Date.now();
    const result = await provider.generate({
      role,
      ...config,
      schema,
      schemaName: `eval_${role}`,
      system,
      data,
    });
    calls.push({
      model: result.actualModel,
      latencyMs: Date.now() - started,
      ...result.usage,
      estimatedCost: estimatedCost(result.actualModel, result.usage),
    });
    return result.output;
  };
  const strategy = await run(
    "strategist",
    configuration.strategist,
    strategyOutputSchema,
    "Create a campaign strategy for evaluation.",
    fixture,
  );
  const hooks = await run(
    "hooks",
    configuration.hooks,
    hooksOutputSchema,
    "Create 12-20 campaign hooks for evaluation.",
    { fixture, strategy },
  );
  const quality = await run(
    "qa",
    configuration.judge,
    evaluationSchema,
    "Score each requested quality dimension independently. Do not reuse one score across dimensions.",
    { fixture, strategy, hooks },
  );
  return {
    configuration: configuration.name,
    fixture,
    quality,
    usage: {
      latencyMs: calls.reduce((sum, call) => sum + call.latencyMs, 0),
      inputTokens: calls.reduce((sum, call) => sum + call.inputTokens, 0),
      outputTokens: calls.reduce((sum, call) => sum + call.outputTokens, 0),
      cachedTokens: calls.reduce((sum, call) => sum + call.cachedTokens, 0),
      estimatedCost: calls.some((call) => call.estimatedCost === null)
        ? null
        : calls.reduce((sum, call) => sum + (call.estimatedCost ?? 0), 0),
    },
  };
}

function aggregate(runs: Awaited<ReturnType<typeof evaluateFixture>>[]) {
  const dimensions = evaluationSchema.keyof().options;
  return Object.fromEntries(
    dimensions.map((dimension) => [
      dimension,
      runs.reduce((sum, run) => sum + run.quality[dimension], 0) / runs.length,
    ]),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.env.QUAE_AGENT_EVAL_LIVE !== "1")
    throw new Error(
      "Set QUAE_AGENT_EVAL_LIVE=1 explicitly; live eval never runs in CI.",
    );
  const fixtures = JSON.parse(
    await readFile(
      new URL("./fixtures/campaigns.json", import.meta.url),
      "utf8",
    ),
  );
  const matrix: EvalConfiguration[] = JSON.parse(
    process.env.QUAE_AGENT_EVAL_MATRIX ?? "[]",
  );
  if (!matrix.length)
    throw new Error(
      "QUAE_AGENT_EVAL_MATRIX must contain at least one named configuration",
    );
  const provider = new OpenAIResponsesProvider();
  const configurations = [];
  for (const configuration of matrix) {
    const runs = [];
    for (const fixture of fixtures)
      runs.push(await evaluateFixture(provider, fixture, configuration));
    configurations.push({ configuration, runs, aggregate: aggregate(runs) });
  }
  const report = {
    createdAt: new Date().toISOString(),
    automaticPromotion: false,
    configurations,
  };
  const path = process.env.QUAE_AGENT_EVAL_REPORT ?? "agent-eval-report.json";
  await writeFile(path, JSON.stringify(report, null, 2));
  console.log(`Wrote human-review model comparison: ${path}`);
}
