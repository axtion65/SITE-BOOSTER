import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth-guard";
import { useAuth } from "@/hooks/use-auth";
import { useSearch } from "wouter";
import { Spinner } from "@/components/ui/spinner";
import { Check, Zap, Crown, ExternalLink, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PLAN_BY_SLUG, PLAN_CATALOG, formatUsd, isPlanSlug, type PlanSlug } from "@workspace/plans";

interface Price {
  id: string;
  unitAmount: number;
  currency: string;
  recurring: { interval: string } | null;
}

interface CheckoutPlanConfig {
  slug: PlanSlug;
  prices: Price[];
}

const MODEL_COSTS = [
  { model: "Ovi",      cost: "30",    desc: "Video + audio",    color: "#818cf8" },
  { model: "Wan 2.5",  cost: "200",   desc: "Cinematic",        color: "#a78bfa" },
  { model: "Kling 2.5",cost: "300",   desc: "Ultra-realistic",  color: "#c084fc" },
  { model: "Veo 3",    cost: "1,500", desc: "Agency grade",     color: "#e879f9" },
];

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("quae_token");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

export default function StudioBilling() {
  return (
    <RequireAuth>
      <BillingContent />
    </RequireAuth>
  );
}

function BillingContent() {
  const { user, login } = useAuth();
  const { toast } = useToast();
  const search = useSearch();
  const [checkoutPlans, setCheckoutPlans] = useState<CheckoutPlanConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [annual, setAnnual] = useState(false);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const currentPlan = (user as any)?.plan ?? "free";
  const credits = (user as any)?.credits ?? 0;

  // Sync after checkout success
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("checkout_success") === "true") {
      setSyncing(true);
      fetch("/api/billing/sync", { method: "POST", headers: authHeader() })
        .then(r => r.json())
        .then(data => {
          if (data.synced) {
            toast({ title: "Subscription activated!", description: `You're now on the ${data.plan} plan with ${data.credits} credits.` });
            fetch("/api/auth/me", { headers: authHeader() })
              .then(r => r.json())
              .then(u => { if (u?.id) login(localStorage.getItem("quae_token")!, u); })
              .catch(() => {});
          }
        })
        .catch(() => {})
        .finally(() => setSyncing(false));
    }
  }, [search]);

  // Load the application catalog enriched with server-side Stripe price IDs.
  useEffect(() => {
    fetch("/api/billing/plans", { headers: authHeader() })
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Failed to load billing plans");
        if (!Array.isArray(data.plans)) throw new Error("Invalid billing plan response");
        setCheckoutPlans(data.plans);
      })
      .catch((error: Error) => {
        setPlansError(error.message);
        toast({ title: "Failed to load plans", description: error.message, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, []);

  const getPriceForInterval = (slug: PlanSlug, interval: "month" | "year") =>
    checkoutPlans.find(plan => plan.slug === slug)?.prices.find(p => p.recurring?.interval === interval);

  const handleUpgrade = async (slug: PlanSlug) => {
    const interval = annual ? "year" : "month";
    const price = getPriceForInterval(slug, interval);
    if (!price) { toast({ title: "Price not found", variant: "destructive" }); return; }

    setCheckingOut(slug);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ priceId: price.id }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else toast({ title: "Checkout failed", description: data.error, variant: "destructive" });
    } catch {
      toast({ title: "Checkout failed", variant: "destructive" });
    } finally {
      setCheckingOut(null);
    }
  };

  const handlePortal = async () => {
    setOpeningPortal(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST", headers: authHeader() });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else toast({ title: "Portal unavailable", description: data.error, variant: "destructive" });
    } catch {
      toast({ title: "Portal failed", variant: "destructive" });
    } finally {
      setOpeningPortal(false);
    }
  };

  const currentPlanDefinition = isPlanSlug(currentPlan) ? PLAN_BY_SLUG[currentPlan] : PLAN_BY_SLUG.free;
  const creditPct = Math.round((credits / currentPlanDefinition.credits) * 100);

  return (
    <div className="min-h-full bg-[#0B1220] text-white">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-black tracking-[0.2em] uppercase text-violet-400/70 mb-2">Billing</p>
            <h1 className="text-3xl font-black text-white tracking-tight">Plan &amp; Credits</h1>
            <p className="text-[#AAB6CA] mt-1 text-sm">Manage your subscription and monitor usage.</p>
          </div>
          {currentPlan !== "free" && (
            <button
              onClick={handlePortal}
              disabled={openingPortal}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-white/[0.05] hover:bg-white/10 border border-white/[0.08] hover:border-white/15 transition-all"
            >
              {openingPortal ? <Spinner className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
              Manage Subscription
            </button>
          )}
        </div>

        {/* Current Plan Card */}
        <div className="p-6 rounded-2xl border border-white/[0.08] bg-white/[0.02]">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                {currentPlan === "free"
                  ? <Zap className="h-5 w-5 text-violet-400" />
                  : <Crown className="h-5 w-5 text-violet-400" />}
              </div>
              <div>
                <div className="text-white font-black capitalize text-lg">{currentPlan} Plan</div>
                <div className="text-[11px] text-[#AAB6CA]">
                  {currentPlan === "free" ? "90 credits included at sign-up" : "Credits reset monthly"}
                </div>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 text-xs font-bold capitalize">
              {currentPlan}
            </span>
          </div>

          {/* Credit bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[#AAB6CA]">Credits remaining</span>
              <span className="text-white font-bold">{credits.toLocaleString()} / {currentPlanDefinition.credits.toLocaleString()}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-all"
                style={{ width: `${Math.min(creditPct, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-white/25">
              <span>{Math.max(0, 100 - creditPct)}% used</span>
              <span>{creditPct}% remaining</span>
            </div>
          </div>
        </div>

        {/* Billing toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black tracking-[0.2em] uppercase text-violet-400/70 mb-1">Plans</p>
            <h2 className="text-xl font-black text-white">Choose a plan</h2>
          </div>
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
            <button
              onClick={() => setAnnual(false)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${!annual ? "bg-white/10 text-white" : "text-slate-400 hover:text-white/50"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-5 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${annual ? "bg-violet-600 text-white shadow-lg shadow-violet-600/20" : "text-slate-400 hover:text-white/50"}`}
            >
              Annual <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-bold">Save 20%</span>
            </button>
          </div>
        </div>

        {/* Syncing notice */}
        {syncing && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Activating your subscription…
          </div>
        )}

        {/* Plan cards */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
        ) : plansError ? (
          <div className="text-center py-12 px-6 rounded-2xl border border-red-500/20 bg-red-500/[0.06]">
            <p className="font-bold text-red-300">Billing is temporarily unavailable.</p>
            <p className="text-sm text-[#AAB6CA] mt-2">We couldn’t load billing configuration. Please try again later.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLAN_CATALOG.map((plan) => {
              const planKey = plan.slug;
              const isCurrent = currentPlan === planKey;
              const isPopular = plan.mostPopular;
              const interval = annual ? "year" : "month";
              const price = getPriceForInterval(plan.slug, interval);
              const displayAmount = formatUsd(plan.monthlyPriceCents);
              const annualTotal = annual ? formatUsd(plan.annualPriceCents) : null;

              return (
                <div
                  key={plan.slug}
                  className={`relative rounded-2xl p-6 border transition-all hover:-translate-y-0.5 flex flex-col ${
                    isPopular
                      ? "border-violet-500/60 bg-violet-500/[0.06] shadow-lg shadow-violet-500/10 hover:shadow-xl hover:shadow-violet-500/15"
                      : isCurrent
                        ? "border-white/15 bg-white/[0.03] hover:shadow-xl hover:shadow-white/5"
                        : "border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:shadow-xl"
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-violet-500 text-white text-[10px] font-black rounded-full uppercase tracking-widest whitespace-nowrap shadow-lg shadow-violet-500/30">
                      Most Popular
                    </div>
                  )}
                  {isCurrent && !isPopular && (
                    <div className="absolute -top-3 right-4 px-3 py-1 bg-white/10 text-white/60 text-[10px] font-black rounded-full border border-white/[0.10] whitespace-nowrap uppercase tracking-widest">
                      Current plan
                    </div>
                  )}

                  <div className="mb-5">
                    <h3 className="font-black text-white text-lg mb-0.5">{plan.name}</h3>
                    <p className="text-[11px] text-slate-400 min-h-[2rem] leading-relaxed">{plan.description}</p>
                  </div>

                  <div className="mb-1">
                    <span className="text-4xl font-black text-white">${displayAmount}</span>
                    <span className="text-slate-400 text-sm">/mo</span>
                  </div>
                  {annualTotal ? (
                    <div className="text-xs text-green-400 mb-5 font-semibold">${annualTotal}/yr — save 20%</div>
                  ) : (
                    <div className="mb-5 h-4" />
                  )}

                  {/* Credits highlight */}
                  <div className="p-3 rounded-xl bg-white/[0.04] text-[11px] text-white/50 mb-5 text-center border border-white/[0.06]">
                    <span className="text-white font-black">{plan.credits.toLocaleString()} credits</span>/mo
                  </div>

                  <ul className="space-y-2.5 mb-6 flex-1">
                    {plan.features.map((f, fi) => (
                      <li key={fi} className="flex items-start gap-2 text-xs text-[#AAB6CA]">
                        <Check className="h-3.5 w-3.5 text-violet-400 mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <button
                    disabled={isCurrent || !price || checkingOut === plan.slug}
                    onClick={() => !isCurrent && handleUpgrade(plan.slug)}
                    className={`w-full flex items-center justify-center h-10 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      isPopular
                        ? "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/20"
                        : isCurrent
                          ? "bg-white/[0.05] text-[#AAB6CA] border border-white/[0.08] cursor-not-allowed"
                          : "bg-white/[0.05] hover:bg-white/10 text-white border border-white/[0.08] hover:border-white/15"
                    }`}
                  >
                    {checkingOut === plan.slug ? (
                      <><Spinner className="h-4 w-4 mr-2" /> Redirecting…</>
                    ) : isCurrent ? (
                      "Current Plan"
                    ) : plan.slug === "free" ? (
                      "Free Plan"
                    ) : !price ? (
                      "Checkout not configured"
                    ) : (
                      `Upgrade to ${plan.name}`
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Credit cost reference */}
        <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
          <h4 className="text-[10px] font-black text-slate-400 mb-5 text-center uppercase tracking-[0.2em]">Credit cost per video</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {MODEL_COSTS.map((m, i) => (
              <div key={i} className="text-center p-4 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:border-violet-500/20 transition-colors">
                <div className="text-xs font-bold text-white mb-1">{m.model}</div>
                <div className="font-black text-xl mb-0.5" style={{ color: m.color }}>{m.cost}</div>
                <div className="text-[10px] text-white/25 uppercase tracking-wide">{m.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-[11px] text-white/20 pb-4">
          Free plan: 90 credits at sign-up · No credit card required · Upgrade any time · Cancel anytime
        </p>
      </div>
    </div>
  );
}
