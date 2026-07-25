import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth-guard";
import { useAuth } from "@/hooks/use-auth";
import { useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Check, Zap, Crown, ExternalLink, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Price {
  id: string;
  unitAmount: number;
  currency: string;
  recurring: { interval: string } | null;
}

interface Plan {
  id: string;
  name: string;
  description: string;
  metadata: Record<string, string>;
  prices: Price[];
}

const PLAN_ORDER = ["starter", "pro", "agency"];

const PLAN_FEATURES: Record<string, string[]> = {
  starter: ["600 credits/month", "Ovi + Wan 2.5 models", "All platforms", "1080p export", "Priority support"],
  pro:     ["2,000 credits/month", "All models + Kling 2.5", "All platforms", "4K export", "Priority rendering", "Video history"],
  agency:  ["6,000 credits/month", "All models + Veo 3", "All platforms", "4K export", "Fastest rendering", "Team workspace", "API access"],
};

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
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [annual, setAnnual] = useState(true);
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
            // Refresh user data by re-fetching /api/auth/me
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

  // Load plans from Stripe
  useEffect(() => {
    fetch("/api/billing/plans", { headers: authHeader() })
      .then(r => r.json())
      .then(data => setPlans(data.plans ?? []))
      .catch(() => toast({ title: "Failed to load plans", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const getPriceForInterval = (plan: Plan, interval: "month" | "year") =>
    plan.prices.find(p => p.recurring?.interval === interval);

  const handleUpgrade = async (plan: Plan) => {
    const interval = annual ? "year" : "month";
    const price = getPriceForInterval(plan, interval);
    if (!price) { toast({ title: "Price not found", variant: "destructive" }); return; }

    setCheckingOut(plan.id);
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

  const sortedPlans = [...plans].sort(
    (a, b) => PLAN_ORDER.indexOf(a.metadata?.plan) - PLAN_ORDER.indexOf(b.metadata?.plan)
  );

  const maxCredits: Record<string, number> = { free: 90, starter: 600, pro: 2000, agency: 6000 };
  const creditPct = Math.round((credits / (maxCredits[currentPlan] ?? 90)) * 100);

  return (
    <div className="p-8 h-full overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Billing & Plan</h1>
            <p className="text-muted-foreground mt-1">Manage your subscription and credits.</p>
          </div>
          {currentPlan !== "free" && (
            <Button variant="outline" onClick={handlePortal} disabled={openingPortal} className="gap-2">
              {openingPortal ? <Spinner className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
              Manage Subscription
            </Button>
          )}
        </div>

        {/* Current Plan Card */}
        <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                {currentPlan === "free" ? <Zap className="h-5 w-5 text-violet-400" /> : <Crown className="h-5 w-5 text-violet-400" />}
              </div>
              <div>
                <div className="text-white font-bold capitalize text-lg">{currentPlan} Plan</div>
                <div className="text-xs text-muted-foreground">
                  {currentPlan === "free" ? "3 free videos included" : "Credits reset monthly"}
                </div>
              </div>
            </div>
            <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/30 capitalize">{currentPlan}</Badge>
          </div>

          {/* Credit bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Credits remaining</span>
              <span className="text-white font-semibold">{credits.toLocaleString()} / {(maxCredits[currentPlan] ?? 90).toLocaleString()}</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-400 transition-all"
                style={{ width: `${Math.min(creditPct, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1 credit = $0.01 · Ovi costs 30 · Wan 200 · Kling 300 · Veo 1,500</span>
              <span>{creditPct}%</span>
            </div>
          </div>
        </div>

        {/* Billing toggle */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Choose a plan</h2>
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
            <button
              onClick={() => setAnnual(false)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${!annual ? "bg-white/10 text-white" : "text-white/40"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${annual ? "bg-violet-600 text-white" : "text-white/40"}`}
            >
              Annual <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">Save 20%</span>
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
        ) : sortedPlans.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p>No plans available right now.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            {sortedPlans.map((plan) => {
              const planKey = plan.metadata?.plan;
              const isCurrent = currentPlan === planKey;
              const isPopular = planKey === "pro";
              const interval = annual ? "year" : "month";
              const price = getPriceForInterval(plan, interval);
              const monthlyPrice = getPriceForInterval(plan, "month");
              const displayAmount = price
                ? annual
                  ? Math.round((price.unitAmount / 100) / 12)
                  : price.unitAmount / 100
                : null;
              const annualTotal = annual && price ? (price.unitAmount / 100).toFixed(0) : null;

              return (
                <div
                  key={plan.id}
                  className={`relative rounded-2xl p-6 border transition-all flex flex-col ${
                    isPopular
                      ? "border-violet-500 bg-violet-500/5 shadow-lg shadow-violet-500/10"
                      : isCurrent
                        ? "border-white/20 bg-white/[0.03]"
                        : "border-white/5 bg-white/[0.02]"
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-violet-500 text-white text-xs font-bold rounded-full uppercase tracking-wider whitespace-nowrap">
                      Most Popular
                    </div>
                  )}
                  {isCurrent && (
                    <div className="absolute -top-3 right-4 px-3 py-1 bg-white/10 text-white/70 text-xs font-semibold rounded-full border border-white/10 whitespace-nowrap">
                      Current plan
                    </div>
                  )}

                  <div className="mb-1 font-bold text-white text-lg">{plan.name}</div>
                  <p className="text-xs text-white/40 mb-5 leading-relaxed min-h-[2.5rem]">{plan.description}</p>

                  {displayAmount !== null ? (
                    <div className="mb-1">
                      <span className="text-4xl font-black text-white">${displayAmount}</span>
                      <span className="text-white/40 text-sm">/mo</span>
                    </div>
                  ) : (
                    <div className="text-4xl font-black text-white mb-1">—</div>
                  )}
                  {annualTotal && (
                    <div className="text-xs text-green-400 mb-5">${annualTotal}/yr — save 20%</div>
                  )}
                  {!annualTotal && <div className="mb-5 h-4" />}

                  <ul className="space-y-2.5 mb-6 flex-1">
                    {(PLAN_FEATURES[planKey] ?? []).map((f, fi) => (
                      <li key={fi} className="flex items-start gap-2 text-sm text-white/60">
                        <Check className="h-4 w-4 text-violet-400 mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Button
                    className={`w-full font-semibold ${isPopular ? "bg-violet-600 hover:bg-violet-500" : ""}`}
                    variant={isPopular ? "default" : "outline"}
                    disabled={isCurrent || checkingOut === plan.id}
                    onClick={() => !isCurrent && handleUpgrade(plan)}
                  >
                    {checkingOut === plan.id ? (
                      <><Spinner className="h-4 w-4 mr-2" /> Redirecting…</>
                    ) : isCurrent ? (
                      "Current Plan"
                    ) : (
                      `Upgrade to ${plan.name}`
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* Free plan note */}
        <p className="text-center text-xs text-white/30 pb-4">
          Free plan: 90 credits included at sign-up · No credit card required · Upgrade any time
        </p>
      </div>
    </div>
  );
}
