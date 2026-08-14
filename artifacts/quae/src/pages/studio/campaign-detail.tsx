import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { Check, RefreshCw, Sparkles, ArrowRight } from "lucide-react";
import { MarketingPage, PremiumCard, fieldClass } from "./marketing-shared";
import { ActionButton, StatusPill } from "@/components/quae-design-system";
import { statusLabel } from "./campaigns";
import { useToast } from "@/hooks/use-toast";
import { formatScore } from "@/lib/format-score";
const headers = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("quae_token") || ""}`,
});
const specialists = [
  ["research.v1", "Research"],
  ["strategist.v1", "Strategist"],
  ["hooks.v1", "Hook Specialist"],
  ["writer-direct-response.v1", "Direct Response Writer"],
  ["writer-story.v1", "Story Writer"],
  ["writer-social.v1", "Native Social Writer"],
  ["judge.v1", "Judge"],
  ["rewrite.v1", "Rewriter"],
  ["factcheck.v1", "Fact Check"],
  ["qa.v1", "Final QA"],
];
export default function CampaignDetail() {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [, params] = useRoute("/studio/campaigns/:id");
  const [data, setData] = useState<any>(),
    [notes, setNotes] = useState("");
  const load = async () => {
    try {
      const response = await fetch(`/api/campaigns/${params?.id}`, {
        headers: headers(),
      });
      if (!response.ok) throw new Error("load");
      setData(await response.json());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  };
  useEffect(() => {
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [params?.id]);
  const run = data?.runs?.[0],
    result = run?.final_result,
    active = ["queued", "running"].includes(run?.status);
  async function post(path: string, body: Record<string, unknown>) {
    if (busy) return;
    setBusy(path);
    try {
      const response = await fetch(`/api/campaigns/${data.id}/${path}`, {
        method: "POST",
        headers: {
          ...headers(),
          "Idempotency-Key": String(body.idempotencyKey || ""),
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const title =
          response.status === 401
            ? "Your session has expired. Please sign in again."
            : response.status === 409
              ? path === "run-team"
                ? "Your campaign is already being worked on."
                : "This campaign version has been superseded."
              : "We couldn’t complete that action. Please try again.";
        toast({ title, variant: "destructive" });
        return;
      }
      toast({
        title:
          path === "approve"
            ? "Campaign approved"
            : path === "request-changes"
              ? "Your changes are queued"
              : "Your AI team is starting",
      });
      setNotes("");
      await load();
    } finally {
      setBusy(null);
    }
  }
  if (loadError && !data)
    return (
      <div className="quae-page p-10">
        <PremiumCard>
          <p>We couldn’t load this campaign.</p>
          <button
            className="mt-4 font-bold text-violet-200"
            onClick={() => void load()}
          >
            Try again
          </button>
        </PremiumCard>
      </div>
    );
  if (!data) return <div className="quae-page p-10">Loading campaign…</div>;
  const statusFor = (version: string) => {
    const repairActive =
      ["repairing", "fact_checking", "quality_checking"].includes(
        run?.current_stage,
      ) &&
      data.agents?.some(
        (agent: { prompt_version: string }) =>
          agent.prompt_version === "rewrite-qa-repair.v1",
      );
    if (repairActive && version === "rewrite.v1")
      return run.current_stage === "repairing" ? "Working" : "Complete";
    if (repairActive && version === "factcheck.v1")
      return run.current_stage === "fact_checking"
        ? "Working"
        : run.current_stage === "quality_checking"
          ? "Complete"
          : "Waiting";
    if (repairActive && version === "qa.v1")
      return run.current_stage === "quality_checking" ? "Working" : "Waiting";
    const a = data.agents?.find((x: any) => x.prompt_version === version);
    if (a?.status === "completed") return "Complete";
    if (a?.status === "running") return "Working";
    if (a?.status === "failed") return "Failed";
    if (run?.status === "needs_revision") return "Needs revision";
    return "Waiting";
  };
  return (
    <MarketingPage
      eyebrow="Campaign workspace"
      title={data.name}
      description={data.brief.objective}
    >
      <div className="space-y-6">
        <PremiumCard elevated>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold">Your AI marketing team</h2>
            <StatusPill>{statusLabel(run?.status || data.status)}</StatusPill>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {specialists.map(([v, n]) => {
              const s = statusFor(v);
              return (
                <div key={v} className="rounded-xl bg-[#1B2940] p-3">
                  <p className="text-xs font-bold">{n}</p>
                  <p
                    className={`mt-2 text-xs ${s === "Complete" ? "text-emerald-300" : s === "Working" ? "text-violet-300" : "text-[#8494AC]"}`}
                  >
                    {s}
                  </p>
                </div>
              );
            })}
          </div>
          {!run && (
            <ActionButton
              disabled={busy !== null}
              onClick={() =>
                post("run-team", { idempotencyKey: crypto.randomUUID() })
              }
              className="mt-6"
            >
              <Sparkles className="h-4 w-4" />
              Run AI team
            </ActionButton>
          )}
        </PremiumCard>
        {run?.status === "needs_revision" && (
          <PremiumCard elevated>
            <div className="max-w-3xl">
              <p className="quae-eyebrow">Quality protection</p>
              <h2 className="text-2xl font-black text-amber-200">
                Quae caught an issue before publishing
              </h2>
              <p className="mt-3 leading-7 text-[#B9C5D8]">
                Our quality team stopped this version because part of the
                content could not be verified or did not meet Quae’s quality
                standard. You won’t be asked to approve content that failed
                review.
              </p>
              <textarea
                className={`${fieldClass} mt-5`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Tell the team what you want changed…"
              />
              <button
                disabled={!notes.trim() || busy !== null || active}
                onClick={() =>
                  post("request-changes", {
                    runId: run.id,
                    notes,
                    idempotencyKey: crypto.randomUUID(),
                  })
                }
                className="mt-2 w-full rounded-xl bg-violet-500 p-3 font-bold text-white disabled:opacity-50"
              >
                <RefreshCw
                  className={`mr-2 inline h-4 w-4 ${busy === "request-changes" ? "animate-spin" : ""}`}
                />
                {busy === "request-changes"
                  ? "QUEUEING CHANGES…"
                  : "REQUEST CHANGES"}
              </button>
            </div>
          </PremiumCard>
        )}
        {result && (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <PremiumCard>
                <p className="quae-eyebrow">Campaign Strategy</p>
                <h3 className="text-xl font-bold">{result.strategy?.angle}</h3>
                <p className="mt-3 text-[#B9C5D8]">
                  <b>Audience:</b> {result.strategy?.audience}
                </p>
                <p className="mt-2 text-[#B9C5D8]">
                  <b>Positioning:</b> {result.strategy?.positioning}
                </p>
                <div className="mt-5 space-y-2">
                  {result.hooks?.hooks?.slice(0, 5).map((h: any) => (
                    <p className="rounded-xl bg-[#263754] p-3 text-sm">
                      {h.text}
                    </p>
                  ))}
                </div>
              </PremiumCard>
              <PremiumCard>
                <p className="quae-eyebrow">Blind Judge Scores</p>
                {result.judge?.candidates?.map((c: any) => (
                  <div className="mb-3 flex items-center justify-between rounded-xl bg-[#263754] p-4">
                    <div>
                      <b>{c.label}</b>
                      <p className="text-xs text-[#B9C5D8]">
                        {c.strengths?.[0]}
                      </p>
                    </div>
                    <span className="text-xl font-black">
                      {formatScore(c.total)}/100
                    </span>
                  </div>
                ))}
                <p className="mt-4 font-bold text-violet-200">
                  Winner: {result.judge?.winner} ·{" "}
                  {formatScore(result.judge?.winningScore)}/100
                </p>
              </PremiumCard>
            </div>
            <PremiumCard>
              <p className="quae-eyebrow">Winning Draft</p>
              <p className="text-sm text-[#B9C5D8]">
                Selected by Quae’s blind review
              </p>
              <h2 className="mt-4 text-xl font-black">
                {result.winningScript?.title}
              </h2>
              <p className="mt-4 whitespace-pre-wrap leading-7 text-[#B9C5D8]">
                {result.winningScript?.script}
              </p>
            </PremiumCard>
            <PremiumCard>
              <p className="quae-eyebrow">Final Improved Script</p>
              <p className="text-sm text-[#B9C5D8]">
                Refined and quality-checked by Quae
              </p>
              <h2 className="text-2xl font-black">
                {result.finalScript?.title}
              </h2>
              <p className="mt-4 text-lg font-semibold text-violet-200">
                {result.finalScript?.hook}
              </p>
              <p className="mt-5 whitespace-pre-wrap leading-7 text-[#B9C5D8]">
                {result.finalScript?.script}
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <StatusPill>
                  Fact Check: {result.factcheck?.pass ? "Pass" : "Needs review"}
                </StatusPill>
                <StatusPill>
                  Quality: {result.qa?.pass ? "Pass" : "Needs revision"}
                </StatusPill>
                <div className="font-bold">
                  CTA: {result.finalScript?.callToAction}
                </div>
              </div>
              {result.factcheck?.unsupportedClaims?.length > 0 && (
                <div className="mt-4 rounded-xl bg-amber-400/10 p-4 text-amber-200">
                  {result.factcheck.unsupportedClaims.join(" · ")}
                </div>
              )}
            </PremiumCard>
          </>
        )}
        {run?.status === "ready_for_review" && (
          <PremiumCard elevated>
            <div className="grid gap-4 md:grid-cols-2">
              <ActionButton
                disabled={busy !== null}
                onClick={() => post("approve", { runId: run.id })}
              >
                <Check className="h-4 w-4" />
                APPROVE CAMPAIGN
              </ActionButton>
              <div>
                <textarea
                  className={fieldClass}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Tell the team what to change…"
                />
                <button
                  disabled={!notes.trim() || busy !== null}
                  onClick={() =>
                    post("request-changes", {
                      runId: run.id,
                      notes,
                      idempotencyKey: crypto.randomUUID(),
                    })
                  }
                  className="mt-2 w-full rounded-xl bg-[#263754] p-3 font-bold disabled:opacity-50"
                >
                  <RefreshCw className="mr-2 inline h-4 w-4" />
                  REQUEST CHANGES
                </button>
              </div>
            </div>
          </PremiumCard>
        )}
        {data.status === "approved" && (
          <PremiumCard elevated>
            <h2 className="text-2xl font-black text-emerald-300">
              Campaign Approved
            </h2>
            <Link
              href="/studio"
              className="mt-5 inline-flex items-center gap-2 font-bold text-violet-200"
            >
              Continue to Creative <ArrowRight className="h-4 w-4" />
            </Link>
          </PremiumCard>
        )}
        {active && !result && (
          <PremiumCard>
            <p className="py-10 text-center text-[#B9C5D8]">
              Current stage:{" "}
              {(run.current_stage || "queued").replaceAll("_", " ")}. Progress
              is persisted safely.
            </p>
          </PremiumCard>
        )}
      </div>
    </MarketingPage>
  );
}
