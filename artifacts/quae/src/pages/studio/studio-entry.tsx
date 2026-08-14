import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import StudioIndex from "./index";
import {
  buildApprovedCampaignHandoff,
  CAMPAIGN_HANDOFF_SOURCE_KEY,
  STUDIO_DRAFT_KEY,
  type ApprovedCampaignHandoff,
} from "@/lib/campaign-handoff";

function authHeaders() {
  const token = localStorage.getItem("quae_token") || "";
  return { Authorization: `Bearer ${token}` };
}

export default function StudioEntry() {
  const search = useSearch();
  const campaignId = new URLSearchParams(search).get("campaignId")?.trim() || "";
  const [handoff, setHandoff] = useState<ApprovedCampaignHandoff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(campaignId));

  useEffect(() => {
    if (!campaignId) {
      setHandoff(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, {
          headers: authHeaders(),
        });
        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? "Your session has expired. Please sign in again."
              : "We couldn’t load that approved campaign.",
          );
        }
        const campaign = await response.json();
        const next = buildApprovedCampaignHandoff(campaign);
        if (cancelled) return;

        // Approved campaign context wins over an unrelated old Creative draft.
        // Once the same campaign has been loaded, preserve later Creative edits on refresh.
        const currentSource = localStorage.getItem(CAMPAIGN_HANDOFF_SOURCE_KEY);
        if (currentSource !== next.campaignId) {
          localStorage.setItem(STUDIO_DRAFT_KEY, JSON.stringify(next.draft));
          localStorage.setItem(CAMPAIGN_HANDOFF_SOURCE_KEY, next.campaignId);
        }
        setHandoff(next);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "We couldn’t load that approved campaign.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  if (!campaignId) return <StudioIndex />;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0D1728] p-6 text-[#B9C5D8]">
        Loading your approved campaign into Creative Studio…
      </div>
    );
  }

  if (error || !handoff) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0D1728] p-6">
        <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-[#20304A] p-8 shadow-2xl">
          <p className="quae-eyebrow">Campaign handoff</p>
          <h2 className="mt-2 text-2xl font-black text-white">We couldn’t load this campaign into Creative Studio.</h2>
          <p className="mt-3 leading-7 text-[#B9C5D8]">{error}</p>
          <div className="mt-6 flex flex-wrap gap-4">
            <Link href={`/studio/campaigns/${encodeURIComponent(campaignId)}`} className="font-bold text-violet-200">
              Back to campaign
            </Link>
            <Link href="/studio" className="font-bold text-violet-200">
              Open Creative without campaign
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0D1728]">
      <div className="shrink-0 border-b border-emerald-300/15 bg-emerald-400/5 px-5 py-3 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-300">Approved Campaign</p>
            <p className="mt-1 font-bold text-white">{handoff.campaignName}</p>
            <p className="mt-1 text-sm text-[#B9C5D8]">
              Your approved campaign has been loaded into Creative Studio. Creative edits here do not change the approved campaign history.
            </p>
          </div>
          <Link
            href={`/studio/campaigns/${encodeURIComponent(handoff.campaignId)}`}
            className="text-sm font-bold text-emerald-200 hover:underline"
          >
            View approved campaign
          </Link>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <StudioIndex />
      </div>
    </div>
  );
}
