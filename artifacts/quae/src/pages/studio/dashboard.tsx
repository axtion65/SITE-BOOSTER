import { RequireAuth } from "@/components/auth-guard";
import { useGetProjectStats, useListProjects } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Film, Zap, CheckCircle2, Clock, PlusCircle, TrendingUp, Coins } from "lucide-react";

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

  const planLabel = user?.plan === "free" ? "Free" : user?.plan === "creator" ? "Creator" : "Agency";
  const maxCredits = user?.plan === "free" ? 300 : user?.plan === "creator" ? 3000 : 15000;
  const creditsRemaining = user?.credits ?? 0;
  const creditsUsed = Math.max(0, maxCredits - creditsRemaining);
  const creditPct = Math.round((creditsRemaining / maxCredits) * 100);

  return (
    <div className="p-8 h-full overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">
              Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
            </h1>
            <p className="text-muted-foreground mt-1">Here's what's happening with your projects.</p>
          </div>
          <Link href="/studio">
            <Button className="font-semibold gap-2">
              <PlusCircle className="h-4 w-4" /> New Video
            </Button>
          </Link>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={<Film className="h-5 w-5 text-primary" />}
            label="Total Projects"
            value={statsLoading ? "—" : String(stats?.total ?? 0)}
          />
          <StatCard
            icon={<CheckCircle2 className="h-5 w-5 text-green-400" />}
            label="Completed"
            value={statsLoading ? "—" : String(stats?.byStatus?.completed ?? 0)}
            highlight="green"
          />
          <StatCard
            icon={<Clock className="h-5 w-5 text-yellow-400" />}
            label="Processing"
            value={statsLoading ? "—" : String(stats?.byStatus?.processing ?? 0)}
            highlight="yellow"
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5 text-purple-400" />}
            label="Plan"
            value={planLabel}
            highlight="purple"
          />
        </div>

        {/* Credits Card */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Coins className="h-4 w-4 text-yellow-400" /> Credits
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{creditsUsed.toLocaleString()} used</span>
              <span className="text-white font-semibold">{creditsRemaining.toLocaleString()} / {maxCredits.toLocaleString()} remaining</span>
            </div>
            <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-purple-400 transition-all"
                style={{ width: `${creditPct}%` }}
              />
            </div>
            {user?.plan === "free" && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">Upgrade to get up to 15,000 credits/month</span>
                <Link href="/pricing">
                  <Button size="sm" variant="outline" className="h-7 text-xs">Upgrade Plan</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Projects */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Film className="h-4 w-4 text-primary" /> Recent Projects
            </CardTitle>
            <Link href="/studio/projects">
              <Button size="sm" variant="ghost" className="text-xs text-muted-foreground hover:text-white h-7">
                View all →
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {projectsLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : recentProjects.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Film className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No projects yet.</p>
                <Link href="/studio">
                  <Button size="sm" className="mt-4">Create your first video</Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentProjects.map((p) => (
                  <Link key={p.id} href={`/studio/projects/${p.id}`}>
                    <div className="flex items-center justify-between py-3 hover:bg-white/5 -mx-2 px-2 rounded-lg cursor-pointer transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                          <Zap className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{p.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(p.createdAt).toLocaleDateString()} · {p.platform ?? "—"} · {p.duration ?? "—"}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={p.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/studio">
            <Card className="border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-white group-hover:text-primary transition-colors">New Video</p>
                  <p className="text-xs text-muted-foreground">AI script + render</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/templates">
            <Card className="border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <Film className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <p className="font-semibold text-white group-hover:text-purple-400 transition-colors">Browse Templates</p>
                  <p className="text-xs text-muted-foreground">12 proven formats</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/studio/projects">
            <Card className="border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <p className="font-semibold text-white group-hover:text-green-400 transition-colors">My Videos</p>
                  <p className="text-xs text-muted-foreground">View all projects</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

      </div>
    </div>
  );
}

function StatCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: "green" | "yellow" | "purple" }) {
  const bg = highlight === "green" ? "bg-green-500/10 border-green-500/20" :
             highlight === "yellow" ? "bg-yellow-500/10 border-yellow-500/20" :
             highlight === "purple" ? "bg-purple-500/10 border-purple-500/20" :
             "bg-primary/10 border-primary/20";
  return (
    <Card className={`border ${bg}`}>
      <CardContent className="p-5 flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed": return <Badge variant="success" className="text-xs">Completed</Badge>;
    case "processing": return <Badge className="bg-primary/20 text-primary border-transparent text-xs">Processing</Badge>;
    case "failed": return <Badge variant="destructive" className="text-xs">Failed</Badge>;
    default: return <Badge variant="outline" className="text-muted-foreground text-xs">Draft</Badge>;
  }
}
