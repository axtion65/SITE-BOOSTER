import { RequireAuth } from "@/components/auth-guard";
import { useGetProjectStats, useListProjects } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Film, Zap, CheckCircle2, Clock, PlusCircle, TrendingUp, Coins, ArrowRight } from "lucide-react";
import { PLAN_BY_SLUG, isPlanSlug } from "@workspace/plans";

export default function StudioDashboard() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}

function DashboardContent() {
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = useGetProjectStats();
  const { data: projects, isLoading: projectsLoading } = useListProjects();

  const recentProjects = projects?.slice(0, 5) ?? [];

  const planLabel = user?.plan && isPlanSlug(user.plan) ? PLAN_BY_SLUG[user.plan].name : PLAN_BY_SLUG.free.name;
  const maxCredits = user?.plan && isPlanSlug(user.plan) ? PLAN_BY_SLUG[user.plan].credits : PLAN_BY_SLUG.free.credits;
  const creditsRemaining = user?.credits ?? 0;
  const creditsUsed = Math.max(0, maxCredits - creditsRemaining);
  const creditPct = maxCredits > 0 ? Math.min(100, Math.round((creditsRemaining / maxCredits) * 100)) : 0;

  const firstName = user?.name?.trim() ? user.name.trim().split(" ")[0] : null;

  return (
    <div className="quae-page min-h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-10 px-5 py-10 sm:px-8 sm:py-14">

        {/* Header */}
        <div className="relative flex flex-col gap-7 overflow-hidden rounded-[28px] border border-white/[.07] bg-gradient-to-br from-[#263754] via-[#20304A] to-[#18263D] p-7 shadow-[0_30px_90px_rgba(2,8,23,.32)] sm:flex-row sm:items-center sm:justify-between sm:p-10 before:absolute before:-right-16 before:-top-24 before:h-72 before:w-72 before:rounded-full before:bg-violet-500/15 before:blur-3xl">
          <div>
            <p className="text-[11px] font-black tracking-[0.2em] uppercase text-violet-400/70 mb-3">
              Your AI Marketing Department
            </p>
            <h1 className="text-4xl font-black text-white tracking-[-.035em] leading-tight sm:text-5xl">
              {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
            </h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-[#B9C5D8]">Your marketing workspace is ready. Create a campaign asset, continue recent work, or review your production activity.</p>
          </div>
          <Link href="/studio">
            <Button className="relative h-12 px-6 bg-gradient-to-r from-violet-600 to-[#5B7CFA] hover:from-violet-500 hover:to-indigo-400 rounded-xl font-bold text-sm shadow-xl shadow-violet-950/35 gap-2 transition-all">
              <PlusCircle className="h-4 w-4" /> New Video
            </Button>
          </Link>
        </div>

        {/* Stats Row */}
        <div><div className="mb-4 flex items-end justify-between"><div><p className="quae-eyebrow">Workspace overview</p><h2 className="text-xl font-extrabold text-white">Marketing production at a glance</h2></div><Badge className="border-emerald-400/20 bg-emerald-400/10 text-emerald-300">Live workspace</Badge></div><div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={<Film className="h-5 w-5 text-violet-400" />}
            label="Total Projects"
            value={statsLoading ? "—" : String(stats?.total ?? 0)}
            glow="violet"
          />
          <StatCard
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />}
            label="Completed"
            value={statsLoading ? "—" : String(stats?.byStatus?.completed ?? 0)}
            glow="emerald"
          />
          <StatCard
            icon={<Clock className="h-5 w-5 text-amber-400" />}
            label="Processing"
            value={statsLoading ? "—" : String(stats?.byStatus?.processing ?? 0)}
            glow="amber"
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5 text-purple-400" />}
            label="Plan"
            value={planLabel}
            glow="purple"
          />
        </div></div>

        {/* Credits Card */}
        <div className="rounded-3xl border border-white/[0.06] bg-gradient-to-br from-[#20304A] to-[#18263D] p-7 space-y-5 shadow-2xl shadow-slate-950/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-black tracking-[0.2em] uppercase text-violet-400/70">Credits</p>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/20">
                <Coins className="h-3 w-3 text-amber-400" />
                <span className="text-[10px] font-bold text-amber-400">{planLabel}</span>
              </div>
            </div>
            {user?.plan === "free" && (
              <Link href="/studio/billing">
                <Button size="sm" variant="outline" className="h-7 text-xs border-white/10 text-white/60 hover:text-white hover:border-white/20 rounded-lg">
                  Upgrade Plan
                </Button>
              </Link>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#AAB6CA] text-xs">{creditsUsed.toLocaleString()} used</span>
              <span className="text-white font-bold text-sm">{creditsRemaining.toLocaleString()} <span className="text-slate-400 font-normal">/ {maxCredits.toLocaleString()}</span></span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 transition-all duration-700"
                style={{ width: `${creditPct}%` }}
              />
            </div>
          </div>

          {user?.plan === "free" && (
            <p className="text-[11px] text-slate-400">Upgrade to get up to 6,000 credits/month and unlock premium templates.</p>
          )}
        </div>

        {/* Recent Projects */}
        <div className="overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-br from-[#20304A] to-[#18263D] shadow-2xl shadow-slate-950/20">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
            <p className="text-[11px] font-black tracking-[0.2em] uppercase text-violet-400/70">Recent Projects</p>
            <Link href="/studio/projects">
              <button className="text-[11px] font-semibold text-[#AAB6CA] hover:text-white/70 transition-colors flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </button>
            </Link>
          </div>

          {projectsLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : recentProjects.length === 0 ? (
            <div className="text-center py-16 px-6">
              <div className="h-16 w-16 rounded-2xl bg-violet-600/10 border border-violet-600/20 flex items-center justify-center mx-auto mb-4">
                <Film className="h-8 w-8 text-violet-400/50" />
              </div>
              <p className="text-white font-semibold mb-1">No projects yet</p>
              <p className="text-slate-400 text-sm mb-6">Create your first AI video ad to get started.</p>
              <Link href="/studio">
                <Button className="h-9 px-5 bg-violet-600 hover:bg-violet-500 rounded-xl font-bold text-sm shadow-lg shadow-violet-600/20">
                  Create your first video
                </Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {recentProjects.map((p) => (
                <Link key={p.id} href={`/studio/projects/${p.id}`}>
                  <div className="flex items-center justify-between px-6 py-4 hover:bg-white/[0.03] cursor-pointer transition-colors group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-xl bg-violet-600/10 border border-violet-600/20 flex items-center justify-center flex-shrink-0">
                        {p.status === "completed"
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          : p.status === "processing"
                          ? <Clock className="h-4 w-4 text-amber-400" />
                          : <Zap className="h-4 w-4 text-violet-400" />
                        }
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate group-hover:text-violet-300 transition-colors">{p.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {new Date(p.createdAt).toLocaleDateString()} · {p.platform ?? "—"} · {p.duration ?? "—"}
                        </p>
                        {p.status === "failed" && (
                          <p className="text-[10px] text-red-400/80 mt-0.5">Credits refunded · Click to retry</p>
                        )}
                      </div>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div>
          <p className="text-[11px] font-black tracking-[0.2em] uppercase text-violet-400/70 mb-4">Quick Actions</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Link href="/studio">
              <div className="rounded-2xl border border-white/[0.06] bg-[#20304A] hover:-translate-y-1 hover:border-violet-400/30 hover:bg-[#263754] transition-all duration-300 cursor-pointer group p-6 flex items-center gap-4 shadow-xl shadow-slate-950/15">
                <div className="h-10 w-10 rounded-xl bg-violet-600/10 border border-violet-600/20 flex items-center justify-center flex-shrink-0 group-hover:bg-violet-600/20 transition-colors">
                  <Zap className="h-5 w-5 text-violet-400" />
                </div>
                <div>
                  <p className="font-bold text-white text-sm group-hover:text-violet-300 transition-colors">New Video</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">AI script + render</p>
                </div>
              </div>
            </Link>
            <Link href="/templates">
              <div className="rounded-2xl border border-white/[0.06] bg-[#20304A] hover:-translate-y-1 hover:border-purple-400/30 hover:bg-[#263754] transition-all duration-300 cursor-pointer group p-6 flex items-center gap-4 shadow-xl shadow-slate-950/15">
                <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-500/20 transition-colors">
                  <Film className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <p className="font-bold text-white text-sm group-hover:text-purple-300 transition-colors">Browse Templates</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">12 proven formats</p>
                </div>
              </div>
            </Link>
            <Link href="/studio/projects">
              <div className="rounded-2xl border border-white/[0.06] bg-[#20304A] hover:-translate-y-1 hover:border-emerald-400/30 hover:bg-[#263754] transition-all duration-300 cursor-pointer group p-6 flex items-center gap-4 shadow-xl shadow-slate-950/15">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="font-bold text-white text-sm group-hover:text-emerald-300 transition-colors">My Videos</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">View all projects</p>
                </div>
              </div>
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  glow,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  glow?: "violet" | "emerald" | "amber" | "purple";
}) {
  const glowMap = {
    violet: "border-violet-400/20 bg-gradient-to-br from-[#263754] to-[#20304A]",
    emerald: "border-emerald-400/20 bg-gradient-to-br from-[#263754] to-[#20304A]",
    amber: "border-amber-400/20 bg-gradient-to-br from-[#263754] to-[#20304A]",
    purple: "border-purple-400/20 bg-gradient-to-br from-[#263754] to-[#20304A]",
  };
  const cls = glow ? glowMap[glow] : "border-white/[0.06] bg-[#1D2940]";

  return (
    <div className={`rounded-2xl border ${cls} p-6 shadow-xl shadow-slate-950/15`}>
      <div className="mb-3">{icon}</div>
      <p className="text-2xl font-black text-white tracking-tight">{value}</p>
      <p className="text-[11px] text-slate-400 mt-1 font-medium tracking-wide">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          Completed
        </span>
      );
    case "processing":
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide bg-violet-500/10 text-violet-400 border border-violet-500/20">
          Processing
        </span>
      );
    case "narrating":
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide bg-sky-500/10 text-sky-400 border border-sky-500/20">
          Adding Voiceover
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide bg-red-500/10 text-red-400 border border-red-500/20">
          Failed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide bg-white/[0.06] text-[#AAB6CA] border border-white/[0.08]">
          Draft
        </span>
      );
  }
}
