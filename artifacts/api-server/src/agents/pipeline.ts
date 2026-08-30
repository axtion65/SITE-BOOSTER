import { createHash, randomInt } from "node:crypto";
import {
  buildEvidenceLedger,
  buildResearchInput,
  validateEvidenceLedger,
} from "./evidence";
import { scoreCandidates } from "./scoring";
import { AGENT_PRICING_VERSION, estimatedCost } from "./pricing";
import { CampaignError } from "./errors";
import { qualityCycleReady, runBoundedQualityCycle } from "./qualityCycle";
import { pool } from "@workspace/db";
import type { z } from "@workspace/api-zod";
import { AgentModelRouter, type AgentRole } from "./modelRouter";
import {
  OpenAIResponsesProvider,
  isTransientProviderError,
  type AgentProvider,
} from "./provider";
import {
  factCheckInputSchema,
  factCheckOutputSchema,
  hooksInputSchema,
  hooksOutputSchema,
  judgeInputSchema,
  judgeOutputSchema,
  qaInputSchema,
  qaOutputSchema,
  researchOutputSchema,
  rewriteInputSchema,
  scriptOutputSchema,
  strategyInputSchema,
  strategyOutputSchema,
  validateEvidenceReferences,
  writerInputSchema,
} from "./schemas";

const versions = {
  research: "research.v1",
  strategist: "strategist.v1",
  hooks: "hooks.v1",
  writerA: "writer-direct-response.v1",
  writerB: "writer-story.v1",
  writerC: "writer-social.v1",
  judge: "judge.v1",
  rewriter: "rewrite.v1",
  factcheck: "factcheck.v1",
  qa: "qa.v1",
} as const;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class CampaignPipeline {
  constructor(
    private provider: AgentProvider = new OpenAIResponsesProvider(),
    private models = new AgentModelRouter(),
  ) {}
  private async agent<T>(
    runId: string,
    sequence: number,
    role: AgentRole,
    version: string,
    schema: z.ZodType<T>,
    system: string,
    data: unknown,
  ) {
    const prior = await pool.query(
      "SELECT structured_output FROM agent_runs WHERE campaign_run_id=$1 AND role=$2 AND sequence=$3 AND status='completed'",
      [runId, version, sequence],
    );
    if (prior.rows[0]) return schema.parse(prior.rows[0].structured_output);
    const config = this.models.get(role);
    const id = crypto.randomUUID();
    const hash = createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");
    const started = Date.now();
    await pool.query(
      `INSERT INTO agent_runs(id,campaign_run_id,role,sequence,status,prompt_version,schema_version,configured_model,input_hash) VALUES($1,$2,$3,$4,'running',$5,'v1',$6,$7) ON CONFLICT(campaign_run_id,role,sequence) DO UPDATE SET status='running',retry_count=agent_runs.retry_count+1,error_code=NULL`,
      [id, runId, version, sequence, version, config.model, hash],
    );
    let attempt = 0;
    let schemaRepairAttempted = false;
    while (true) {
      try {
        const selected = schemaRepairAttempted
          ? this.models.get("schemaRepair")
          : config;
        const result = await this.provider.generate({
          role: schemaRepairAttempted ? "schemaRepair" : role,
          model: selected.model,
          reasoning: selected.reasoning,
          schema,
          schemaName: version.replace(/[^a-zA-Z0-9_]/g, "_"),
          system: schemaRepairAttempted
            ? `${system}\nThis is the single permitted schema-repair attempt. Return a strictly valid complete result.`
            : system,
          data,
        });
        await pool.query(
          `UPDATE agent_runs SET status='completed',actual_model=$2,structured_output=$3,input_tokens=$4,output_tokens=$5,cached_tokens=$6,latency_ms=$7,estimated_cost_usd=$10,pricing_version=$11,retry_count=$12,completed_at=NOW() WHERE campaign_run_id=$1 AND role=$8 AND sequence=$9`,
          [
            runId,
            result.actualModel,
            result.output,
            result.usage.inputTokens,
            result.usage.outputTokens,
            result.usage.cachedTokens,
            Date.now() - started,
            version,
            sequence,
            estimatedCost(result.actualModel, result.usage),
            AGENT_PRICING_VERSION,
            attempt,
          ],
        );
        return result.output;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "SCHEMA_INVALID" &&
          !schemaRepairAttempted
        ) {
          schemaRepairAttempted = true;
          continue;
        }
        if (attempt < 2 && isTransientProviderError(error)) {
          await sleep(500 * 2 ** attempt++);
          continue;
        }
        await pool.query(
          "UPDATE agent_runs SET status='failed',error_code=$2,latency_ms=$3,completed_at=NOW() WHERE campaign_run_id=$1 AND role=$4 AND sequence=$5",
          [
            runId,
            error instanceof Error
              ? error.message.slice(0, 80)
              : "PROVIDER_ERROR",
            Date.now() - started,
            version,
            sequence,
          ],
        );
        throw error;
      }
    }
  }
  private async completeQuality(
    runId: string,
    context: unknown,
    ledger: any[],
    base: {
      research: unknown;
      strategy: z.infer<typeof strategyOutputSchema>;
      hooks: unknown;
      winningScript: unknown;
      finalScript: z.infer<typeof scriptOutputSchema>;
      judge: any;
    },
    stage: (name: string) => Promise<unknown>,
  ) {
    let { finalScript } = base;
    const quality = await runBoundedQualityCycle({
      finalScript,
      ledger,
      strategy: base.strategy,
      judge: base.judge,
      checkFacts: async (script, deterministicInvalid, cycle) => {
        await stage("fact_checking");
        return this.agent(
          runId,
          70 + cycle * 20,
          "factcheck",
          cycle ? "factcheck-repair.v1" : versions.factcheck,
          factCheckOutputSchema,
          "Semantically validate every claim and every modifier against the authoritative evidence ledger.",
          factCheckInputSchema.parse({
            ledger,
            finalScript: script,
            deterministicInvalid,
          }),
        );
      },
      checkQa: async (script, checkedFacts, cycle) => {
        await stage("quality_checking");
        return this.agent(
          runId,
          80 + cycle * 20,
          "qa",
          cycle ? "qa-repair.v1" : versions.qa,
          qaOutputSchema,
          "Apply the quality floor. Never fake PASS.",
          qaInputSchema.parse({
            context,
            strategy: base.strategy,
            judge: base.judge,
            finalScript: script,
            factcheck: checkedFacts,
          }),
        );
      },
      repair: async (repairInput) => {
        await stage("repairing");
        return this.agent(
          runId,
          90,
          "rewriter",
          "rewrite-qa-repair.v1",
          scriptOutputSchema,
          `Remove or rewrite every unsupported claim identified by Fact Check, QA, or deterministic evidence validation while preserving supported persuasive content. Never invent facts. Never turn an exact value into “starting at”, “from”, “up to”, a range, discount, guarantee, scarcity, availability, or performance claim unless that modifier is explicitly supported by the evidence ledger. Prefer deletion or conservative wording whenever support is uncertain.`,
          repairInput,
        );
      },
    });
    ({ finalScript } = quality);
    const { factcheck, qa } = quality;
    const ready = qualityCycleReady(
      quality,
      Number(process.env.QUAE_CAMPAIGN_MIN_SCORE || 75),
    );
    const result = { ...base, finalScript, ledger, factcheck, qa };
    await pool.query(
      `UPDATE campaign_runs SET status=$2,current_stage=$3,final_result=$4,judge_score=$5,qa_status=$6,completed_at=NOW(),lease_owner=NULL,lease_expires_at=NULL,updated_at=NOW() WHERE id=$1`,
      [
        runId,
        ready ? "ready_for_review" : "needs_revision",
        ready ? "customer_review" : "quality_review_failed",
        result,
        typeof base.judge?.winningScore === "number"
          ? base.judge.winningScore
          : null,
        ready ? "pass" : "failed",
      ],
    );
    await pool.query(
      "UPDATE campaigns SET status=$2,updated_at=NOW() WHERE id=(SELECT campaign_id FROM campaign_runs WHERE id=$1)",
      [runId, ready ? "ready_for_review" : "needs_revision"],
    );
  }
  private async executeRevision(
    runId: string,
    context: unknown,
    ledger: any[],
    snapshot: any,
    stage: (name: string) => Promise<unknown>,
  ) {
    const previousRunId = snapshot?.customerRevision?.previousRunId;
    if (typeof previousRunId !== "string") return false;
    const source = (
      await pool.query(
        `SELECT previous.final_result FROM campaign_runs previous JOIN campaign_runs current ON current.campaign_id=previous.campaign_id WHERE current.id=$1 AND previous.id=$2 AND previous.status IN ('ready_for_review','needs_revision') LIMIT 1`,
        [runId, previousRunId],
      )
    ).rows[0]?.final_result;
    const strategy = strategyOutputSchema.safeParse(source?.strategy);
    const finalScript = scriptOutputSchema.safeParse(source?.finalScript);
    if (!strategy.success || !finalScript.success) return false;
    const factcheck = factCheckOutputSchema.safeParse(source?.factcheck);
    const qa = qaOutputSchema.safeParse(source?.qa);
    const factcheckFailures = factcheck.success
      ? [
          ...factcheck.data.unsupportedClaims,
          ...factcheck.data.conciseReasons,
        ]
      : [];
    const qaIssues = qa.success
      ? [qa.data.customerSummary, ...qa.data.issues].filter(Boolean)
      : [];
    await stage("repairing_revision");
    const repaired = await this.agent(
      runId,
      60,
      "rewriter",
      "rewrite-customer-revision.v1",
      scriptOutputSchema,
      "Revise the saved draft once. Follow the customer's requested change and resolve every prior Fact Check and QA issue. Use only the authoritative evidence ledger; delete any claim that cannot be supported. Do not restart ideation or invent new facts.",
      rewriteInputSchema.parse({
        winner: finalScript.data,
        judge: {
          customerRevision: snapshot.customerRevision,
          priorJudge: source?.judge ?? null,
        },
        strategy: strategy.data,
        ledger,
        qaIssues,
        factcheckFailures,
      }),
    );
    await this.completeQuality(
      runId,
      context,
      ledger,
      {
        research: source?.research ?? null,
        strategy: strategy.data,
        hooks: source?.hooks ?? { hooks: [] },
        winningScript: source?.winningScript ?? finalScript.data,
        finalScript: repaired,
        judge: source?.judge ?? {},
      },
      stage,
    );
    return true;
  }
  async execute(runId: string, context: unknown) {
    const stage = async (name: string) =>
      pool.query(
        "UPDATE campaign_runs SET current_stage=$2,heartbeat_at=NOW(),updated_at=NOW() WHERE id=$1",
        [runId, name],
      );
    const snapshot = context as any;
    const ledger = buildEvidenceLedger(snapshot);
    if (!validateEvidenceLedger(snapshot, ledger))
      throw new CampaignError("INVALID_EVIDENCE_LEDGER", "permanent");
    if (await this.executeRevision(runId, context, ledger, snapshot, stage))
      return;
    const researchInput = buildResearchInput(snapshot, ledger);
    await stage("research");
    const research = await this.agent(
      runId,
      10,
      "research",
      versions.research,
      researchOutputSchema,
      "Analyze the supplied authoritative evidence ledger. Identify insights and unknowns; never add facts.",
      researchInput,
    );
    await stage("strategy");
    const strategy = await this.agent(
      runId,
      20,
      "strategist",
      versions.strategist,
      strategyOutputSchema,
      "Develop a strategy grounded exclusively in the ledger.",
      strategyInputSchema.parse({ context, research, ledger }),
    );
    await stage("hooks");
    const hooks = await this.agent(
      runId,
      30,
      "hooks",
      versions.hooks,
      hooksOutputSchema,
      "Create 12-20 strong hooks; cite ledger facts.",
      hooksInputSchema.parse({ ledger, research, strategy }),
    );
    await stage("writing_concepts");
    const shared = writerInputSchema.parse({
      ledger,
      research,
      strategy,
      hooks,
      context,
    });
    const [a, b, c] = await Promise.all([
      this.agent(
        runId,
        40,
        "writer",
        versions.writerA,
        scriptOutputSchema,
        "DIRECT RESPONSE specialist. Never see or infer other writers' work.",
        shared,
      ),
      this.agent(
        runId,
        41,
        "writer",
        versions.writerB,
        scriptOutputSchema,
        "STORY / EMOTIONAL specialist. Never see or infer other writers' work.",
        shared,
      ),
      this.agent(
        runId,
        42,
        "writer",
        versions.writerC,
        scriptOutputSchema,
        "NATIVE SOCIAL specialist. Never see or infer other writers' work.",
        shared,
      ),
    ]);
    const initialWriters = [
      { key: "writerA", script: a },
      { key: "writerB", script: b },
      { key: "writerC", script: c },
    ];
    const repaired = await Promise.all(
      initialWriters.map(async (candidate, index) => {
        const invalid = validateEvidenceReferences(ledger, [candidate.script]);
        if (!invalid.length) return candidate;
        const script = await this.agent(
          runId,
          43 + index,
          "rewriter",
          `writer-evidence-repair-${candidate.key}.v1`,
          scriptOutputSchema,
          "Repair unsupported evidence references once. Remove unsupported claims; never invent evidence.",
          rewriteInputSchema.parse({
            winner: candidate.script,
            judge: { invalid },
            strategy,
            ledger,
          }),
        );
        return validateEvidenceReferences(ledger, [script]).length
          ? null
          : { ...candidate, script };
      }),
    );
    const writers = repaired.filter(
      (candidate): candidate is NonNullable<typeof candidate> =>
        candidate !== null,
    );
    if (writers.length < 2)
      return this.finishFailed(runId, {
        ledger,
        research,
        failureCode: "INSUFFICIENT_VALID_CANDIDATES",
      });
    for (let i = writers.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [writers[i], writers[j]] = [writers[j], writers[i]];
    }
    const candidates = writers.map((x, i) => ({
      label: `Candidate ${i + 1}` as
        "Candidate 1" | "Candidate 2" | "Candidate 3",
      script: x.script,
    }));
    const mapping = Object.fromEntries(
      writers.map((x, i) => [`Candidate ${i + 1}`, x.key]),
    );
    await pool.query(
      "UPDATE campaign_runs SET candidate_mapping=$2 WHERE id=$1",
      [runId, mapping],
    );
    await stage("evaluating_scripts");
    const rawJudge = await this.agent(
      runId,
      50,
      "judge",
      versions.judge,
      judgeOutputSchema,
      "Score every blind candidate using exactly the supplied weighted rubric. Do not choose or total scores.",
      judgeInputSchema.parse({ strategy, ledger, candidates }),
    );
    let judge = scoreCandidates(rawJudge);
    if (judge.needsTieBreak) {
      const tied = await this.agent(
        runId,
        51,
        "judge",
        "judge-tiebreak.v1",
        judgeOutputSchema,
        "One final bounded tie-break: rescore all blind candidates independently.",
        judgeInputSchema.parse({ strategy, ledger, candidates }),
      );
      judge = scoreCandidates(tied);
    }
    const winningScript = candidates.find(
      (x) => x.label === judge.winner,
    )!.script;
    await stage("rewriting");
    let finalScript = await this.agent(
      runId,
      60,
      "rewriter",
      versions.rewriter,
      scriptOutputSchema,
      "Improve the winning script without adding facts.",
      rewriteInputSchema.parse({
        winner: winningScript,
        judge,
        strategy,
        ledger,
      }),
    );
    await this.completeQuality(
      runId,
      context,
      ledger,
      { research, strategy, hooks, winningScript, finalScript, judge },
      stage,
    );
  }
  private async finishFailed(runId: string, result: unknown) {
    await pool.query(
      `WITH changed AS (UPDATE campaign_runs SET status='needs_revision', qa_status='unsupported_claims', final_result=$2, completed_at=NOW(), lease_owner=NULL, lease_expires_at=NULL WHERE id=$1 RETURNING campaign_id) UPDATE campaigns SET status='needs_revision', updated_at=NOW() WHERE id=(SELECT campaign_id FROM changed)`,
      [runId, result],
    );
  }
}
