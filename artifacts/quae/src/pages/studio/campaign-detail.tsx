import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import {
  Check,
  RefreshCw,
  Sparkles,
  ArrowRight,
  Image,
  Video,
  FileText,
} from "lucide-react";
import {
  MarketingImage,
  MarketingPage,
  PremiumCard,
  fieldClass,
} from "./marketing-shared";
import { ActionButton, StatusPill } from "@/components/quae-design-system";
import { statusLabel } from "./campaigns";
import { useToast } from "@/hooks/use-toast";
import { customerCopy } from "@/lib/customer-copy";
const headers = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("quae_token") || ""}`,
});
export default function CampaignDetail() {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [, params] = useRoute("/studio/campaigns/:id");
  const [data, setData] = useState<any>(),
    [notes, setNotes] = useState(""),
    [rescue, setRescue] = useState<any>(null),
    [visualOptions, setVisualOptions] = useState<any[]>([]),
    [choosingVisual, setChoosingVisual] = useState(false);
  const load = async () => {
    try {
      const response = await fetch(`/api/campaigns/${params?.id}/workspace`, {
        headers: headers(),
      });
      if (!response.ok) throw new Error("load");
      const next = await response.json();
      setData(next);
      setRescue((current: any) => current ?? next.rescue?.prefill);
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
    copy = customerCopy(result),
    active = ["queued", "running"].includes(run?.status);
  const qualityFeedback = Array.from(
    new Set(
      [
        ...(result?.factcheck?.unsupportedClaims || []),
        ...(result?.factcheck?.conciseReasons || []),
        ...(result?.qa?.issues || []),
        result?.qa?.customerSummary,
      ].filter((item): item is string => Boolean(item)),
    ),
  );
  const revisionNotes =
    notes.trim() ||
    qualityFeedback.join(" ") ||
    "Repair the saved draft using only confirmed campaign evidence.";
  function openReview() {
    const section = document.getElementById("campaign-review");
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
    section?.focus({ preventScroll: true });
  }
  function openAssetsReview() {
    const section = document.getElementById("campaign-assets");
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
    section?.focus({ preventScroll: true });
  }
  async function saveRescue() {
    setBusy("rescue");
    try {
      const response = await fetch(`/api/campaigns/${data.id}/rescue`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify(rescue),
      });
      if (!response.ok) throw new Error("save");
      toast({ title: "Campaign details saved" });
      await load();
    } catch {
      toast({
        title: "We couldn’t save those details. Your draft is still here.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }
  async function openVisuals() {
    setBusy("visuals");
    try {
      const response = await fetch(`/api/campaigns/${data.id}/visual-options`, {
        headers: headers(),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setVisualOptions(body);
      setChoosingVisual(true);
    } catch (error) {
      toast({ title: (error as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }
  async function attachVisual(visual: any) {
    if (
      !window.confirm(
        `Use ${visual.name}, version ${visual.version_number}, in this approved campaign?`,
      )
    )
      return;
    setBusy("attach");
    try {
      const response = await fetch(
        `/api/campaigns/${data.id}/asset-selection`,
        {
          method: "PUT",
          headers: { ...headers(), "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            approvedRunId: data.approved_run_id,
            versionId: visual.version_id,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setChoosingVisual(false);
      toast({ title: "Visual confirmed for campaign" });
      await load();
    } catch (error) {
      toast({ title: (error as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }
  async function prepareVideo() {
    setBusy("video");
    try {
      const response = await fetch(`/api/campaigns/${data.id}/video-brief`, {
        method: "POST",
        headers: headers(),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      window.location.assign(
        `/studio?campaignId=${encodeURIComponent(data.id)}&briefId=${encodeURIComponent(body.id)}`,
      );
    } catch (error) {
      toast({ title: (error as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }
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
        const errorBody = await response.json().catch(() => ({}));
        const title =
          response.status === 401
            ? "Your session has expired. Please sign in again."
            : response.status === 409
              ? errorBody.error ||
                (path === "run-team"
                  ? "Your campaign is already being worked on."
                  : "This campaign version has been superseded.")
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
    } catch {
      toast({
        title:
          path === "rebuild" || path === "run-team"
            ? "We couldn’t start your campaign. Please try again."
            : "We couldn’t complete that action. Please try again.",
        variant: "destructive",
      });
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
  const rescueRequired = Boolean(data.rescue?.required);
  const continueHref =
    data.nextAction === "create_visual"
      ? `/studio/mockups?campaignId=${encodeURIComponent(data.id)}${data.product_id ? `&productId=${encodeURIComponent(data.product_id)}` : ""}`
      : data.nextAction === "create_video"
        ? `/studio?campaignId=${encodeURIComponent(data.id)}`
        : "#campaign-assets";
  const continueLabel =
    rescueRequired
      ? "Complete Campaign Details"
      : data.revisionRecovery
        ? "Repair Campaign"
      : data.reviewState === "needs_rebuild"
        ? "Fix Campaign"
      : data.nextAction === "review_campaign"
      ? "Review Campaign"
        : data.nextAction === "create_strategy"
        ? "Start Strategy"
        : data.nextAction === "create_video"
          ? "Prepare Current Video"
        : data.nextAction === "review_assets"
          ? "Review Completed Assets"
          : "Continue Campaign";
  const strategyPending =
    data.nextAction === "create_strategy" &&
    (busy === "rebuild" || busy === "run-team" || active);
  const startStrategy = () =>
    post(
      run?.status === "failed" ? "rebuild" : "run-team",
      run?.status === "failed" ? {} : { idempotencyKey: crypto.randomUUID() },
    );
  return (
    <MarketingPage
      eyebrow="Campaign workspace"
      title={data.name}
      description={data.brief.objective}
    >
      <div className="space-y-6">
        {data.rescue?.required && (
          <PremiumCard elevated>
            <p className="quae-eyebrow">Campaign Rescue</p>
            <h2 className="text-2xl font-black">
              A few campaign details need your confirmation
            </h2>
            <p className="mt-2 text-sm text-[#B9C5D8]">
              We preserved the website evidence and stopped before creating
              generic copy. Confirm these details to continue.
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {[
                ["identity", "Business/campaign identity"],
                ["productsServices", "Products or services"],
                ["targetAudience", "Target audience"],
                ["offerPromotion", "Offer or promotion (optional)"],
                ["callToAction", "Call to action"],
              ].map(([key, label]) => (
                <label key={key} className="text-sm font-bold">
                  {label}
                  <textarea
                    className={`${fieldClass} mt-2`}
                    value={rescue?.[key] || ""}
                    onChange={(e) =>
                      setRescue({ ...rescue, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
            <button
              disabled={busy === "rescue"}
              onClick={saveRescue}
              className="mt-5 rounded-xl bg-violet-600 px-5 py-3 font-bold"
            >
              {busy === "rescue" ? "Saving…" : "Save and continue"}
            </button>
          </PremiumCard>
        )}
        <PremiumCard elevated>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="quae-eyebrow">Your campaign</p>
              <h2 className="text-2xl font-black">
                {data.product_name || "Business-wide offer"}
              </h2>
              <p className="mt-2 text-sm text-[#B9C5D8]">
                {data.brief?.campaignType} · {data.brief?.channel} ·{" "}
                {data.product_audience ||
                  data.business_audience ||
                  "Your saved audience"}
              </p>
            </div>
            {rescueRequired ||
            data.nextAction === "review_campaign" ||
            data.nextAction === "review_assets" ||
            data.reviewState === "needs_rebuild" ? (
              <button
                onClick={
                  rescueRequired
                    ? () => window.scrollTo({ top: 0, behavior: "smooth" })
                    : data.nextAction === "review_assets"
                      ? openAssetsReview
                      : openReview
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 font-bold text-white"
              >
                {continueLabel}
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : data.nextAction === "create_strategy" ? (
              <button
                disabled={busy !== null || active}
                onClick={startStrategy}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {strategyPending ? "Starting strategy…" : continueLabel}
                {strategyPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
              </button>
            ) : (
            data.nextAction === "create_video" && data.attachedVisuals?.length ? (
              <button onClick={prepareVideo} disabled={busy === "video"} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 font-bold text-white disabled:opacity-50">
                {busy === "video" ? "Preparing video…" : continueLabel}
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <Link
                href={continueHref}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 font-bold text-white"
              >
                {continueLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            )
            )}
          </div>
          {strategyPending && (
            <p role="status" className="mt-4 text-sm text-violet-200">
              Your campaign strategy is starting. This page will refresh as it
              progresses.
            </p>
          )}
          <div className="mt-6 grid grid-cols-3 gap-2 lg:grid-cols-6">
            {data.progress?.map((stage: any) => (
              <div
                key={stage.name}
                className={`rounded-xl p-3 text-center text-xs font-bold ${stage.complete ? "bg-emerald-400/15 text-emerald-200" : "bg-white/5 text-slate-400"}`}
              >
                <span className="block">{stage.complete ? "✓" : "○"}</span>
                {stage.name}
              </div>
            ))}
          </div>
        </PremiumCard>
        <div
          id="campaign-assets"
          tabIndex={-1}
          className="scroll-mt-6 rounded-2xl outline-none focus:ring-2 focus:ring-violet-400"
        >
          <h2 className="mb-2 text-2xl font-black">Completed Campaign Assets</h2>
          <p className="mb-6 text-sm text-slate-400">
            Review, open, or download the visuals, videos, and marketing copy
            prepared for this campaign.
          </p>
          <div className="grid gap-6 lg:grid-cols-3">
          <PremiumCard>
            <Image className="h-5 w-5 text-violet-300" />
            <h2 className="mt-3 text-lg font-bold">Product Visuals</h2>
            {data.approved_run_id && (
              <div className="mt-4 grid gap-2">
                <button
                  onClick={openVisuals}
                  className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold"
                >
                  Choose from My Visuals
                </button>
                <Link
                  href={`/studio/mockups?campaignId=${encodeURIComponent(data.id)}&approvedRunId=${encodeURIComponent(data.approved_run_id)}${data.product_id ? `&productId=${encodeURIComponent(data.product_id)}` : ""}`}
                  className="rounded-xl border border-violet-400 px-4 py-3 text-center text-sm font-bold text-violet-200"
                >
                  Create a New Visual
                </Link>
              </div>
            )}
            {choosingVisual && (
              <div className="mt-4 rounded-xl border border-white/10 p-3">
                <p className="text-sm font-bold">
                  Confirm one owned visual version
                </p>
                <div className="mt-3 grid gap-3">
                  {visualOptions.map((v: any) => (
                    <button
                      key={v.version_id}
                      disabled={busy === "attach"}
                      onClick={() => attachVisual(v)}
                      className="overflow-hidden rounded-xl border border-white/10 text-left"
                    >
                      <MarketingImage
                        objectPath={v.object_path}
                        alt={v.name}
                        className="aspect-video w-full object-cover"
                      />
                      <span className="block p-3 text-xs font-bold">
                        {v.name} · Version {v.version_number} ·{" "}
                        {String(v.status).replaceAll("_", " ")}
                      </span>
                    </button>
                  ))}
                  {!visualOptions.length && (
                    <p className="text-xs text-slate-400">
                      No approved visuals are available for this business.
                    </p>
                  )}
                </div>
              </div>
            )}
            {data.visuals?.length ? (
              <div className="mt-4 space-y-3">
                {data.visuals.map((v: any) => (
                  <div key={v.id} className="rounded-xl bg-white/5 p-3">
                    <b>{v.product_name}</b>
                    <p className="text-xs text-slate-400">
                      {v.versions?.length || 0} version
                      {v.versions?.length === 1 ? "" : "s"}
                    </p>
                    <Link
                      href={`/studio/mockups?projectId=${v.id}&campaignId=${data.id}`}
                      className="mt-2 inline-flex text-sm font-bold text-violet-200"
                    >
                      Preview · Open in Studio
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <p className="mt-3 text-sm text-slate-400">
                  No visuals have been created for this campaign yet.
                </p>
                <Link
                  href={`/studio/mockups?campaignId=${data.id}${data.product_id ? `&productId=${data.product_id}` : ""}`}
                  className="mt-4 inline-flex font-bold text-violet-200"
                >
                  Create a visual
                </Link>
              </>
            )}
            {data.attachedVisuals?.length > 0 && (
              <div className="mt-5">
                <p className="quae-eyebrow">Attached from My Visuals</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {data.attachedVisuals.map((v: any) => (
                    <div
                      key={v.version_id}
                      className="overflow-hidden rounded-xl border border-white/10"
                    >
                      <MarketingImage
                        objectPath={v.object_path}
                        alt={v.name}
                        className="aspect-video w-full object-cover"
                      />
                      <p className="p-2 text-xs font-bold">
                        {v.name} · Version {v.version_number}
                        {v.is_primary ? " · Primary" : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </PremiumCard>
          <PremiumCard>
            <Video className="h-5 w-5 text-violet-300" />
            <h2 className="mt-3 text-lg font-bold">Videos</h2>
            {data.approved_run_id &&
              data.attachedVisuals?.length > 0 &&
              !data.videos?.some(
                (v: any) => v.is_current && v.video_url,
              ) && (
                <button
                  onClick={prepareVideo}
                  disabled={busy === "video"}
                  className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold"
                >
                  Prepare Campaign Video
                </button>
              )}
            {data.videos?.length ? (
              <div className="mt-4 space-y-3">
                {data.videos.map((v: any) => (
                  <div key={v.id} className="rounded-xl bg-white/5 p-3">
                    <b>{v.title}</b>
                    <p className="text-xs text-slate-400">
                      {v.is_current
                        ? v.status
                        : "Previous version · not current"}
                    </p>
                    <Link
                      href={`/studio/projects/${v.id}`}
                      className="mt-2 inline-flex text-sm font-bold text-violet-200"
                    >
                      Preview · Open in Studio
                    </Link>
                    {v.status === "completed" && (
                      <a
                        href={`/api/projects/${v.id}/video/download`}
                        className="ml-3 text-sm font-bold text-violet-200"
                      >
                        Download
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <>
                <p className="mt-3 text-sm text-slate-400">
                  No videos have been created for this campaign yet.
                </p>
                {data.status === "approved" && !data.attachedVisuals?.length && (
                  <Link
                    href={`/studio?campaignId=${data.id}`}
                    className="mt-4 inline-flex font-bold text-violet-200"
                  >
                    Create a video
                  </Link>
                )}
              </>
            )}
          </PremiumCard>
          <PremiumCard>
            <FileText className="h-5 w-5 text-violet-300" />
            <h2 className="mt-3 text-lg font-bold">Marketing Copy</h2>
            {copy?.body ? (
              <>
                <p className="mt-3 line-clamp-5 whitespace-pre-wrap text-sm text-slate-300">
                  {copy.body}
                </p>
                <a
                  href="#campaign-copy"
                  className="mt-4 inline-flex font-bold text-violet-200"
                >
                  Review saved copy
                </a>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-400">
                Approved campaign copy will be stored here when it is ready.
              </p>
            )}
          </PremiumCard>
          </div>
        </div>
        {data.status === "approved" && (
          <PremiumCard>
            <h2 className="text-xl font-bold">Create Next Asset</h2>
            <p className="mt-2 text-sm text-slate-400">
              Your campaign, offer, Brand Model, and approved strategy stay
              connected.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                className="rounded-xl bg-[#263754] px-4 py-2 font-bold"
                href={`/studio/mockups?campaignId=${data.id}${data.product_id ? `&productId=${data.product_id}` : ""}`}
              >
                Product Visual
              </Link>
              {data.attachedVisuals?.length ? <button onClick={prepareVideo} disabled={busy === "video"} className="rounded-xl bg-[#263754] px-4 py-2 font-bold disabled:opacity-50">Video</button> : <Link className="rounded-xl bg-[#263754] px-4 py-2 font-bold" href={`/studio?campaignId=${data.id}`}>Video</Link>}
              <a
                className="rounded-xl bg-[#263754] px-4 py-2 font-bold"
                href="#campaign-copy"
              >
                Marketing Copy
              </a>
            </div>
          </PremiumCard>
        )}
        <div id="campaign-copy"></div>
        <div
          id="campaign-review"
          tabIndex={-1}
          className="scroll-mt-6 outline-none"
        >
          {data.reviewState === "needs_rebuild" && (
            <PremiumCard elevated>
              <p className="quae-eyebrow">Campaign review</p>
              <h2 className="text-2xl font-black text-amber-200">
                Campaign information needs to be refreshed
              </h2>
              <p className="mt-3 leading-7 text-[#B9C5D8]">
                {data.reviewExplanation}
              </p>
              {data.revisionRecovery ? (
                <ActionButton
                  disabled={busy !== null || active}
                  onClick={() =>
                    post("request-changes", {
                      runId: data.revisionRecovery.runId,
                      notes:
                        "Repair the saved draft using current confirmed campaign information and resolve every prior Fact Check and QA issue.",
                      idempotencyKey: crypto.randomUUID(),
                    })
                  }
                  className="mt-6"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${busy === "request-changes" ? "animate-spin" : ""}`}
                  />
                  Repair saved draft
                </ActionButton>
              ) : (
                <ActionButton
                  disabled={busy !== null}
                  onClick={() => post("rebuild", {})}
                  className="mt-6"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${busy === "rebuild" ? "animate-spin" : ""}`}
                  />
                  Rebuild from Quae.ai information
                </ActionButton>
              )}
            </PremiumCard>
          )}
        <PremiumCard elevated>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold">Campaign preparation</h2>
            <StatusPill>{statusLabel(run?.status || data.status)}</StatusPill>
          </div>
            <p className="mt-4 text-sm text-[#B9C5D8]">
              Quae uses only this campaign’s confirmed brief and evidence, then
              checks the result for clarity and supported claims. Your saved
              draft remains available if preparation stops.
            </p>
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
              {qualityFeedback.length > 0 && (
                <div className="mt-4 rounded-xl bg-amber-400/10 p-4 text-amber-100">
                  <p className="font-bold">What needs to change</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {qualityFeedback.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              <textarea
                className={`${fieldClass} mt-5`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add an optional instruction, or use the quality feedback above."
              />
              <button
                disabled={busy !== null || active}
                onClick={() =>
                  post("request-changes", {
                    runId: run.id,
                    notes: revisionNotes,
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
                  : "REPAIR SAVED DRAFT"}
              </button>
            </div>
          </PremiumCard>
        )}
        {result && (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <PremiumCard>
                <p className="quae-eyebrow">Campaign Strategy</p>
                  <h3 className="text-xl font-bold">
                    {result.strategy?.angle}
                  </h3>
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
                  <p className="quae-eyebrow">Quality review</p>
                  <h3 className="text-xl font-bold">
                    Your strongest campaign draft
                  </h3>
                  <p className="mt-3 text-[#B9C5D8]">
                    Quae checked the drafts for relevance, clarity, supported
                    claims, and consistency with your confirmed campaign
                    details.
                  </p>
                </PremiumCard>
            </div>
            <PremiumCard>
              <p className="quae-eyebrow">Winning Draft</p>
              <p className="text-sm text-[#B9C5D8]">
                Selected after a campaign quality review
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
                <h2 className="text-2xl font-black">{copy?.title}</h2>
              <p className="mt-4 text-lg font-semibold text-violet-200">
                {copy?.hook}
              </p>
              <p className="mt-5 whitespace-pre-wrap leading-7 text-[#B9C5D8]">
                {copy?.body}
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <StatusPill>
                    Fact Check:{" "}
                    {result.factcheck?.pass ? "Pass" : "Needs review"}
                </StatusPill>
                <StatusPill>
                  Quality: {result.qa?.pass ? "Pass" : "Needs revision"}
                </StatusPill>
                  <div className="font-bold">CTA: {copy?.callToAction}</div>
              </div>
              {result.factcheck?.unsupportedClaims?.length > 0 && (
                <div className="mt-4 rounded-xl bg-amber-400/10 p-4 text-amber-200">
                  {result.factcheck.unsupportedClaims.join(" · ")}
                </div>
              )}
            </PremiumCard>
          </>
        )}
          {data.reviewState !== "needs_rebuild" &&
            run?.status === "ready_for_review" && (
          <PremiumCard elevated>
            <div className="grid gap-4 md:grid-cols-2">
              <ActionButton
                disabled={busy !== null}
                onClick={() => post("approve", { runId: run.id })}
              >
                <Check className="h-4 w-4" />
                    Approve Campaign
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
              href={`/studio/mockups?campaignId=${encodeURIComponent(data.id)}${data.product_id ? `&productId=${encodeURIComponent(data.product_id)}` : ""}`}
              className="mt-5 mr-6 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 font-bold text-white"
            >
              Create Product Visual <ArrowRight className="h-4 w-4" />
            </Link>
            {data.attachedVisuals?.length ? <button onClick={prepareVideo} disabled={busy === "video"} className="mt-5 inline-flex items-center gap-2 font-bold text-violet-200 disabled:opacity-50">Continue to Creative <ArrowRight className="h-4 w-4" /></button> : <Link href={`/studio?campaignId=${encodeURIComponent(data.id)}`} className="mt-5 inline-flex items-center gap-2 font-bold text-violet-200">Continue to Creative <ArrowRight className="h-4 w-4" /></Link>}
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
      </div>
    </MarketingPage>
  );
}
