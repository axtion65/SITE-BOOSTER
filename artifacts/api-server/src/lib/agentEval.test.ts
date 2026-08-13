import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFixture } from "../agents/eval/run";
import type { AgentProvider } from "../agents/provider";

test("mocked evaluation records independent quality dimensions without paid calls", async () => {
  let calls = 0;
  const provider: AgentProvider = {
    async generate(request: any) {
      calls++;
      const output =
        request.role === "strategist"
          ? {
              objective: "O",
              audience: "A",
              positioning: "P",
              corePromise: "C",
              angle: "G",
              objections: [],
              tone: "T",
              channels: [],
            }
          : request.role === "hooks"
            ? {
                hooks: Array.from({ length: 12 }, (_, index) => ({
                  text: `Hook ${index} long enough`,
                  rationale: "Strong reason",
                  evidenceIds: [],
                })),
              }
            : {
                strategyQuality: 91,
                hookQuality: 88,
                persuasion: 86,
                brandAdherence: 92,
                specificity: 84,
                claimSafety: 99,
                scriptQuality: 89,
                judgeAgreement: 80,
              };
      return {
        output: request.schema.parse(output),
        actualModel: "mock",
        usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 2 },
      };
    },
  };
  const config = {
    name: "mock-a",
    strategist: { model: "mock" },
    hooks: { model: "mock" },
    judge: { model: "mock" },
  };
  const report = await evaluateFixture(provider, { id: "fixture" }, config);
  assert.equal(calls, 3);
  assert.equal(report.quality.strategyQuality, 91);
  assert.equal(report.quality.hookQuality, 88);
  assert.equal(report.usage.inputTokens, 30);
});
