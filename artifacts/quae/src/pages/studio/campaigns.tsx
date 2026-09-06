import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Megaphone,
  Plus,
  ArrowRight,
  LayoutTemplate,
  Brain,
  Globe2,
} from "lucide-react";
import {
  MarketingPage,
  PremiumCard,
  StatusPill,
  fieldClass,
} from "./marketing-shared";
import { ActionButton, EmptyState } from "@/components/quae-design-system";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  campaignFormForTemplate,
  CAMPAIGN_TEMPLATE_PRESETS,
  type CampaignTemplatePreset,
  getCampaignTemplate,
} from "@/lib/campaign-templates";
const headers = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("quae_token") || ""}`,
});
export default function CampaignsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const initialTemplate = getCampaignTemplate(
    new URLSearchParams(window.location.search).get("template"),
  );
  const [loadError, setLoadError] = useState(false);
  const [items, setItems] = useState<any[]>([]),
    [context, setContext] = useState<any>(null),
    [products, setProducts] = useState<any[]>([]),
    [creating, setCreating] = useState(false),
    [businessState, setBusinessState] = useState<
      "loading" | "ready" | "missing" | "error"
    >("loading");
  const [selectedTemplate, setSelectedTemplate] = useState(initialTemplate);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [form, setForm] = useState(() =>
    campaignFormForTemplate(initialTemplate),
  );
  useEffect(() => {
    Promise.all([
      fetch("/api/campaigns", { headers: headers() }),
      fetch("/api/marketing-context", { headers: headers() }),
      fetch("/api/products", { headers: headers() }),
    ])
      .then(async ([campaignsResponse, contextResponse, productsResponse]) => {
        if (
          !campaignsResponse.ok ||
          !productsResponse.ok ||
          (!contextResponse.ok && contextResponse.status !== 404)
        ) {
          throw new Error("Campaign workspace could not be loaded");
        }
        const [i, c, p] = await Promise.all([
          campaignsResponse.json(),
          contextResponse.status === 404
            ? Promise.resolve(null)
            : contextResponse.json(),
          productsResponse.json(),
        ]);
        setLoadError(false);
        setItems(i);
        setContext(c);
        setProducts(p);
        setBusinessState(c?.business?.id ? "ready" : "missing");
      })
      .catch(() => {
        setLoadError(true);
        setBusinessState("error");
      });
  }, []);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const applyTemplate = (preset: CampaignTemplatePreset) => {
    setSelectedTemplate(preset);
    setForm(campaignFormForTemplate(preset));
    setLocation(`/studio/campaigns?template=${preset.slug}`, { replace: true });
    setTemplatePickerOpen(false);
  };
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const businessId = context?.business?.id;
    if (!businessId) {
      toast({
        title: "Create your Business Profile first",
        description:
          "Add your business once, then Quae can reuse it for every campaign.",
        variant: "destructive",
      });
      return;
    }
    setCreating(true);
    try {
      const { name, productId, ...brief } = form;
      const r = await fetch("/api/campaigns", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          name,
          businessId,
          productId: productId || null,
          brief,
        }),
      });
      const c = await r.json();
      if (!r.ok) {
        toast({
          title:
            r.status === 401
              ? "Your session has expired"
              : "We couldn’t create this campaign",
          description:
            r.status === 401
              ? "Please sign in again."
              : c?.error || "Please check the brief and try again.",
          variant: "destructive",
        });
        return;
      }
      location.assign(`/studio/campaigns/${c.id}`);
    } finally {
      setCreating(false);
    }
  }
  return (
    <MarketingPage
      eyebrow="Agent Department"
      title="Campaigns"
      description="Brief your AI marketing department once. Quae brings your saved business, brand, and offer intelligence into every specialist's work."
    >
      {loadError && (
        <div className="mb-6 rounded-2xl bg-red-400/10 p-5 text-red-200">
          We couldn’t load your campaign workspace. Refresh to try again.
        </div>
      )}
      <div className="mb-6 grid gap-4 md:grid-cols-[1fr_auto]">
        {businessState === "ready" ? (
          <div className="rounded-2xl bg-emerald-400/10 p-5 ring-1 ring-emerald-300/15">
            <div className="flex gap-3">
              <Brain className="h-5 w-5 text-emerald-300" />
              <div>
                <p className="font-bold">Quae already knows your business.</p>
                <p className="mt-1 text-sm text-[#B9C5D8]">
                  Using <b>{context.business.name}</b>
                  {form.productId && (
                    <>
                      {" "}
                      and{" "}
                      <b>
                        {products.find((p) => p.id === form.productId)?.name}
                      </b>
                    </>
                  )}
                  —no need to repeat what you already taught us.
                </p>
              </div>
            </div>
          </div>
        ) : businessState === "missing" ? (
          <div className="rounded-2xl bg-amber-400/10 p-5 ring-1 ring-amber-300/20">
            <div className="flex gap-3">
              <Brain className="h-5 w-5 text-amber-300" />
              <div>
                <p className="font-bold">Create your Business Profile first.</p>
                <p className="mt-1 text-sm text-[#B9C5D8]">
                  Add your business once. Quae will reuse it for every campaign
                  so you do not have to start over.
                </p>
                <Link
                  href="/studio/business"
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-300 px-4 py-2 text-sm font-bold text-slate-950"
                >
                  Create Business Profile
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-white/[.04] p-5 text-sm text-[#B9C5D8] ring-1 ring-white/10">
            {businessState === "loading"
              ? "Loading your Business Profile…"
              : "Your Business Profile could not be loaded. Refresh to try again."}
          </div>
        )}
        <button
          type="button"
          onClick={() => setTemplatePickerOpen(true)}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#263754] px-5 py-3 text-sm font-bold"
        >
          <LayoutTemplate className="h-4 w-4" />
          Browse Campaign Templates
        </button>
      </div>
      <Link href="/studio/import-website" className="mb-6 flex items-center gap-3 rounded-2xl border border-violet-300/20 bg-violet-400/10 p-5 hover:bg-violet-400/15">
        <Globe2 className="h-5 w-5 text-violet-300" />
        <span><b>Import your website</b><span className="mt-1 block text-sm text-[#B9C5D8]">Scan public business and product details, review every field, then approve what Quae should use.</span></span>
        <ArrowRight className="ml-auto h-5 w-5" />
      </Link>
      <Dialog open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto bg-[#111d31] text-white">
          <DialogHeader>
            <DialogTitle>Campaign Templates</DialogTitle>
            <DialogDescription>
              Choose a business campaign starting point. You can edit every field before creating anything.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {CAMPAIGN_TEMPLATE_PRESETS.map((preset) => (
              <button
                key={preset.slug}
                type="button"
                onClick={() => applyTemplate(preset)}
                className="rounded-xl border border-white/10 bg-white/[.04] p-4 text-left hover:border-violet-300/40 hover:bg-violet-400/10"
              >
                <span className="font-bold text-white">{preset.title}</span>
                <span className="mt-2 block text-sm leading-6 text-[#B9C5D8]">
                  {preset.homepageDescription}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <div className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
        <PremiumCard elevated>
          {selectedTemplate && (
            <p className="mb-4 rounded-xl bg-violet-400/10 px-4 py-3 text-sm font-bold text-violet-200">
              {selectedTemplate.title} selected.
            </p>
          )}
          <h2 className="text-xl font-extrabold">Brief your marketing team</h2>
          <form onSubmit={create} className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              ["name", "Campaign name", "Spring launch"],
              [
                "promotion",
                "Promotion / special offer",
                "Optional offer details",
              ],
            ].map(([k, l, p]) => (
              <label className="space-y-2">
                <span className="text-sm font-semibold">{l}</span>
                <input
                  required={k === "name"}
                  className={fieldClass}
                  value={(form as any)[k]}
                  onChange={(e) => set(k, e.target.value)}
                  placeholder={p}
                />
              </label>
            ))}
            <label className="space-y-2">
              <span className="text-sm font-semibold">Product / offer</span>
              <select
                className={fieldClass}
                value={form.productId}
                onChange={(e) => set("productId", e.target.value)}
              >
                <option value="">Business-wide campaign</option>
                {products
                  .filter((p) => p.active)
                  .map((p) => (
                    <option value={p.id}>{p.name}</option>
                  ))}
              </select>
            </label>
            {[
              [
                "campaignType",
                "Campaign type",
                [
                  "Launch",
                  "Promotion",
                  "Awareness",
                  "Lead generation",
                  "Seasonal",
                ],
              ],
              [
                "channel",
                "Target channel",
                [
                  "Instagram",
                  "TikTok",
                  "YouTube",
                  "Facebook",
                  "Email",
                  "Multi-platform",
                ],
              ],
              [
                "duration",
                "Desired script duration",
                ["15 seconds", "30 seconds", "60 seconds", "90 seconds"],
              ],
            ].map(([k, l, opts]: any) => (
              <label className="space-y-2">
                <span className="text-sm font-semibold">{l}</span>
                <select
                  className={fieldClass}
                  value={(form as any)[k]}
                  onChange={(e) => set(k, e.target.value)}
                >
                  {opts.map((o: string) => (
                    <option>{o}</option>
                  ))}
                </select>
              </label>
            ))}
            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm font-semibold">Objective</span>
              <textarea
                required
                className={fieldClass}
                rows={3}
                value={form.objective}
                onChange={(e) => set("objective", e.target.value)}
              />
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm font-semibold">
                Additional instructions
              </span>
              <textarea
                className={fieldClass}
                rows={3}
                value={form.instructions}
                onChange={(e) => set("instructions", e.target.value)}
              />
            </label>
            <ActionButton
              disabled={creating || businessState !== "ready"}
              className="sm:col-span-2"
            >
              <Plus className="h-4 w-4" />
              {creating
                ? "Creating…"
                : businessState === "missing"
                  ? "Create Business Profile First"
                  : "Create campaign brief"}
            </ActionButton>
          </form>
        </PremiumCard>
        <div className="space-y-4">
          {!items.length ? (
            <EmptyState
              icon={<Megaphone className="mx-auto h-8 w-8 text-violet-300" />}
              title="Your campaign workspace is ready"
              description="Create a brief to put your specialized AI marketing team to work."
            />
          ) : (
            items.map((c) => (
              <Link key={c.id} href={`/studio/campaigns/${c.id}`}>
                <PremiumCard className="flex items-center justify-between">
                  <div>
                    <div className="flex gap-3">
                      <h2 className="font-bold">{c.name}</h2>
                      <StatusPill>
                        {statusLabel(c.latest_run_status || c.status)}
                      </StatusPill>
                    </div>
                    <p className="mt-2 text-sm text-[#B9C5D8]">
                      {c.brief?.objective}
                    </p>
                  </div>
                  <ArrowRight className="text-violet-300" />
                </PremiumCard>
              </Link>
            ))
          )}
        </div>
      </div>
    </MarketingPage>
  );
}
export const statusLabel = (s: string) =>
  ({
    queued: "Queued",
    running: "AI team working",
    ready_for_review: "Ready for your review",
    needs_revision: "Needs revision",
    approved: "Campaign Approved",
    failed: "Failed",
    needs_rebuild: "Needs refresh",
  })[s] || "Draft";
