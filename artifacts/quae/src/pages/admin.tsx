import { RequireAdmin } from "@/components/auth-guard";
import { useGetAdminStats, useListAdminUsers, useUpdateAdminUser, getListAdminUsersQueryKey, getGetAdminStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Users, Film, PlayCircle, UserPlus, Shield, ShieldOff, Search, Coins, UserCheck, Copy, Download, Mail, Send, MessageSquare, AlertCircle, ThumbsUp, Lightbulb } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { AdminUserUpdatePlan } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PAID_PLANS, PLAN_CATALOG, PLAN_BY_SLUG, type PlanSlug } from "@workspace/plans";
import { useAuth } from "@/hooks/use-auth";
import type { AdminUser } from "@workspace/api-client-react";

export default function Admin() {
  return (
    <RequireAdmin>
      <div className="min-h-screen bg-background p-8 text-foreground">
        <div className="max-w-7xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
            <p className="text-muted-foreground mt-2">Manage users and view platform statistics.</p>
          </div>

          <OperationsOverview />

          <Tabs defaultValue="users">
            <TabsList className="mb-4">
              <TabsTrigger value="operations"><PlayCircle className="h-4 w-4 mr-2" />Video & prompts</TabsTrigger>
              <TabsTrigger value="feedback"><MessageSquare className="h-4 w-4 mr-2" />Feedback</TabsTrigger>
              <TabsTrigger value="users"><Users className="h-4 w-4 mr-2" />Users</TabsTrigger>
              <TabsTrigger value="subscribers"><Mail className="h-4 w-4 mr-2" />Subscribers</TabsTrigger>
              <TabsTrigger value="broadcast"><Send className="h-4 w-4 mr-2" />Broadcast</TabsTrigger>
            </TabsList>
            <TabsContent value="operations"><RenderDebugPanel /></TabsContent>
            <TabsContent value="feedback">
              <FeedbackPanel />
            </TabsContent>
            <TabsContent value="users">
              <AdminUsersTable />
            </TabsContent>
            <TabsContent value="subscribers">
              <SubscribersList />
            </TabsContent>
            <TabsContent value="broadcast">
              <BroadcastPanel />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </RequireAdmin>
  );
}

type Operations = {
  usersToday: number; videosToday: number; creditsUsedToday: number; activeSubscriptions: number;
  mrrCents: number; failedRenders: number; failedStripeWebhooks: number | null; queueLength: number;
  averageRenderTimeSeconds: number; health: Record<string, string>;
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("quae_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function OperationsOverview() {
  const [data, setData] = useState<Operations | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    try { const response = await fetch("/api/admin/operations", { headers: authHeaders() }); if (!response.ok) throw new Error("Operations data unavailable"); setData(await response.json()); setError(""); }
    catch (reason: any) { setError(reason.message); }
  };
  useEffect(() => { void load(); const timer = window.setInterval(load, 30_000); return () => window.clearInterval(timer); }, []);
  if (!data) return <Card className="p-6">{error || "Loading operational dashboard…"}</Card>;
  const metrics = [
    ["Users today", data.usersToday], ["Videos today", data.videosToday], ["Credits used today", data.creditsUsedToday.toLocaleString()],
    ["Active subscriptions", data.activeSubscriptions], ["Monthly recurring revenue", `$${(data.mrrCents / 100).toLocaleString()}`],
    ["Failed renders", data.failedRenders], ["Failed Stripe webhooks", data.failedStripeWebhooks ?? "Not tracked"],
    ["Queue length", data.queueLength], ["Average render time", `${data.averageRenderTimeSeconds}s`],
  ];
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">{metrics.map(([label,value]) => <Card key={label}><CardContent className="pt-5"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold mt-1">{value}</p></CardContent></Card>)}</div>
    <Card><CardHeader className="pb-3"><CardTitle className="text-base">System health</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3 md:grid-cols-5">{Object.entries(data.health).map(([service,status]) => <div key={service} className="rounded-lg border border-border p-3"><p className="capitalize font-medium">{service}</p><p className={status === "down" || status === "not_configured" ? "text-xs text-red-400" : "text-xs text-green-400"}>{status.replace("_", " ")}</p></div>)}</CardContent></Card>
  </div>;
}

type RenderDebug = Record<string, any> & { id: string; title: string; status: string };
function RenderDebugPanel() {
  const [renders, setRenders] = useState<RenderDebug[]>([]); const [selected, setSelected] = useState<RenderDebug | null>(null); const [prompt, setPrompt] = useState(""); const { toast } = useToast();
  const load = async () => { const response = await fetch("/api/admin/render-debug", { headers: authHeaders() }); if (response.ok) setRenders(await response.json()); };
  useEffect(() => { void load(); }, []);
  const testRender = async () => { if (!prompt.trim()) { toast({ title: "Enter a test prompt", variant: "destructive" }); return; } if (!confirm("Submit a real fal.ai test render? This can incur provider costs.")) return; const response = await fetch("/api/debug/fal-video-test", { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ prompt, confirmProviderCost: true }) }); const body = await response.json(); toast({ title: response.ok ? "Test render complete" : "Test render failed", description: body.video_url ?? body.error, variant: response.ok ? "default" : "destructive" }); };
  return <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
    <Card><CardHeader><CardTitle>Video testing</CardTitle></CardHeader><CardContent className="space-y-3"><Textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Render test prompt" /><Button className="w-full" onClick={testRender}>Render test prompt</Button><Button variant="outline" className="w-full" onClick={load}>Refresh render logs</Button><div className="max-h-96 overflow-auto space-y-2">{renders.map(render => <button key={render.id} onClick={() => setSelected(render)} className="w-full text-left rounded border border-border p-2 hover:bg-secondary"><p className="truncate text-sm font-medium">{render.title}</p><p className="text-xs text-muted-foreground">{render.status} · {render.model}</p></button>)}</div></CardContent></Card>
    <Card><CardHeader><CardTitle>Prompt debugging</CardTitle></CardHeader><CardContent>{!selected ? <p className="text-muted-foreground">Select a recent render.</p> : <div className="space-y-4">{[["Original customer request",selected.originalRequest],["AI writer output",selected.aiWriterOutput],["Validation output",selected.validationOutput],["Final visual prompt",selected.finalVisualPrompt],["Voiceover",selected.voiceover],["Scene timing",selected.sceneTiming],["Estimated runtime",selected.estimatedRuntime],["Raw prompt",selected.rawPrompt],["Sanitized prompt",selected.sanitizedPrompt],["Final fal.ai payload",JSON.stringify(selected.falPayload,null,2)],["Render logs",JSON.stringify(selected.logs,null,2)]].map(([label,value]) => <div key={label}><p className="text-xs font-semibold text-primary mb-1">{label}</p><pre className="whitespace-pre-wrap break-words rounded bg-black/30 p-3 text-xs text-muted-foreground">{value || "Not captured"}</pre></div>)}</div>}</CardContent></Card>
  </div>;
}

function AdminStats() {
  const { data: stats, isLoading } = useGetAdminStats();

  if (isLoading || !stats) {
    return <div className="h-32 rounded-xl bg-card border border-border animate-pulse" />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <StatCard title="Total Users" value={stats.totalUsers} icon={<Users className="h-4 w-4" />} />
      <StatCard title="Total Projects" value={stats.totalProjects} icon={<Film className="h-4 w-4" />} />
      <StatCard title="Videos Completed" value={stats.totalVideosCompleted} icon={<PlayCircle className="h-4 w-4" />} />
      <StatCard title="Recent Signups (7d)" value={stats.recentSignups} icon={<UserPlus className="h-4 w-4" />} />
    </div>
  );
}

function BroadcastPanel() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState("all");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) {
      toast({ title: "Fill in subject and message", variant: "destructive" });
      return;
    }
    if (!confirm(`Send to all ${audience === "all" ? "users" : audience + " users"}? This cannot be undone.`)) return;

    setSending(true);
    try {
      const token = localStorage.getItem("quae_token");
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ subject, message, audience }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast({ title: `✅ Sent to ${data.sent} users!`, description: `Subject: "${subject}"` });
      setSubject("");
      setMessage("");
    } catch (err: any) {
      toast({ title: "Broadcast failed", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-primary" /> Send Email Broadcast</CardTitle>
          <p className="text-sm text-muted-foreground">Emails are sent via Resend. Allow a few minutes for large lists.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">Audience</label>
            <Select value={audience} onValueChange={setAudience}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                <SelectItem value="free">Free Plan Only</SelectItem>
                <SelectItem value="paid">Paid Plans Only ({PAID_PLANS.map(plan => plan.name).join(" / ")})</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">Subject</label>
            <Input
              placeholder="e.g. Exciting new feature at Quae.ai 🎬"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">Message</label>
            <Textarea
              placeholder="Write your message here. Use blank lines between paragraphs."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              className="resize-none"
            />
          </div>
          <Button className="w-full font-bold" onClick={handleSend} disabled={sending}>
            {sending ? <><span className="animate-spin mr-2">⏳</span> Sending…</> : <><Send className="h-4 w-4 mr-2" /> Send Broadcast</>}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Automatic Emails</CardTitle>
          <p className="text-sm text-muted-foreground">These send automatically — no action needed.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: "Welcome email", desc: "Sent when someone signs up", status: "active" },
            { label: "Video ready", desc: "Sent when a render completes successfully", status: "active" },
            { label: "Render failed", desc: "Sent when a render fails (includes credit refund notice)", status: "active" },
            { label: "Plan upgrade", desc: "Sent when a user upgrades their subscription", status: "active" },
          ].map((item) => (
            <div key={item.label} className="flex items-start justify-between p-3 rounded-lg bg-secondary/30 border border-border">
              <div>
                <p className="text-sm font-medium text-white">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
              <Badge variant="success" className="ml-3 shrink-0">Active</Badge>
            </div>
          ))}
          <p className="text-xs text-muted-foreground pt-2">
            Requires <code className="bg-secondary px-1 rounded">EMAILJS_TEMPLATE_ID</code> secret to be set.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string, value: number, icon: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function SubscribersList() {
  const { data: users, isLoading } = useListAdminUsers();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterPlan, setFilterPlan] = useState("all");

  if (isLoading) {
    return <div className="h-96 rounded-xl bg-card border border-border animate-pulse" />;
  }

  const filtered = (users || []).filter((u) => {
    const matchesPlan = filterPlan === "all" || u.plan === filterPlan;
    const matchesSearch =
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.name || "").toLowerCase().includes(search.toLowerCase());
    return matchesPlan && matchesSearch;
  });

  const handleCopyEmails = () => {
    const emails = filtered.map((u) => u.email).join(", ");
    navigator.clipboard.writeText(emails);
    toast({ title: `${filtered.length} emails copied!`, description: "Paste them into your email campaign tool." });
  };

  const handleExportCSV = () => {
    const rows = [
      ["Name", "Email", "Plan", "Joined"],
      ...filtered.map((u) => [
        u.name || "",
        u.email,
        u.plan,
        new Date(u.createdAt).toLocaleDateString(),
      ]),
    ];
    const csv = rows.map((r) => r.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quae-subscribers.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV downloaded!", description: `${filtered.length} subscribers exported.` });
  };

  return (
    <Card>
      <CardHeader className="border-b border-border py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Subscriber Emails</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {filtered.length} subscriber{filtered.length !== 1 ? "s" : ""} — use these for email campaigns
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyEmails}>
              <Copy className="h-4 w-4 mr-2" /> Copy Emails
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={filterPlan} onValueChange={setFilterPlan}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All Plans" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Plans</SelectItem>
              {PLAN_CATALOG.map(plan => (
                <SelectItem key={plan.slug} value={plan.slug}>{plan.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <div className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium text-white">{u.name || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <Badge variant={u.plan === "free" ? "secondary" : "default"} className="capitalize">
                    {u.plan}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(u.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No subscribers found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

const FEEDBACK_TYPE_ICON: Record<string, React.ReactNode> = {
  bug:         <AlertCircle className="h-4 w-4 text-red-400" />,
  suggestion:  <Lightbulb className="h-4 w-4 text-yellow-400" />,
  compliment:  <ThumbsUp className="h-4 w-4 text-green-400" />,
  other:       <MessageSquare className="h-4 w-4 text-white/40" />,
};

function FeedbackPanel() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("quae_token");
      const res = await fetch("/api/admin/feedback", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setItems(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="h-64 rounded-xl bg-card border border-border animate-pulse" />;
  if (error) return <div className="p-6 text-red-400">Failed to load feedback: {error}</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b border-border py-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" /> Customer Feedback
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {items.length} submission{items.length !== 1 ? "s" : ""} — newest first
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
      </CardHeader>
      <div className="divide-y divide-border">
        {items.length === 0 && (
          <div className="py-16 text-center text-muted-foreground">No feedback yet.</div>
        )}
        {items.map((item: any) => (
          <div key={item.id} className="p-5 flex gap-4 hover:bg-white/[0.02] transition-colors">
            <div className="mt-0.5 flex-shrink-0">
              {FEEDBACK_TYPE_ICON[item.type] ?? FEEDBACK_TYPE_ICON.other}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1.5">
                <Badge variant="outline" className="capitalize text-[10px]">{item.type ?? "other"}</Badge>
                {item.email && (
                  <span className="text-xs text-muted-foreground">{item.email}</span>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Date(item.created_at).toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{item.message}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AdminUsersTable() {
  const { data: users, isLoading, isError } = useListAdminUsers();
  const updateMutation = useUpdateAdminUser();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creditValue, setCreditValue] = useState("");

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() }),
    ]);
  };

  const mutate = async (target: AdminUser, data: Parameters<typeof updateMutation.mutateAsync>[0]["data"], message: string) => {
    try {
      await updateMutation.mutateAsync({ id: target.id, data });
      await refresh();
      toast({ title: "Change saved", description: message });
    } catch (error: any) {
      toast({ title: "Could not save change", description: error?.message ?? "Please try again", variant: "destructive" });
    }
  };

  const changePlan = async (target: AdminUser, plan: PlanSlug) => {
    const allowance = PLAN_BY_SLUG[plan].credits;
    const reset = confirm(`Change ${target.email} to ${PLAN_BY_SLUG[plan].name}?\n\nChoose OK to reset credits to ${allowance.toLocaleString()}, or Cancel to keep the current balance.`);
    if (!reset && !confirm(`Keep ${target.credits.toLocaleString()} credits and change only the plan to ${PLAN_BY_SLUG[plan].name}?`)) return;
    await mutate(target, { plan, resetCreditsForPlan: reset }, `Plan changed to ${PLAN_BY_SLUG[plan].name}${reset ? ` with ${allowance.toLocaleString()} credits` : ""}.`);
  };

  const changeAdmin = async (target: AdminUser) => {
    const removingSelf = target.id === currentUser?.id && target.isAdmin;
    if (!confirm(`${target.isAdmin ? "Remove" : "Grant"} admin access for ${target.email}?${removingSelf ? "\n\nWARNING: This is your own account and you will immediately lose admin access." : ""}`)) return;
    await mutate(target, { isAdmin: !target.isAdmin, confirmSelfDemotion: removingSelf }, target.isAdmin ? "Admin access removed." : "Admin access granted.");
  };

  const editCredits = async (target: AdminUser, mode: "add" | "subtract" | "set" | "reset") => {
    const amount = Number(creditValue);
    if (mode !== "reset" && (!Number.isSafeInteger(amount) || amount < 0)) {
      toast({ title: "Enter a valid whole number", variant: "destructive" }); return;
    }
    const data = mode === "reset" ? { resetCredits: true } : mode === "set" ? { credits: amount } : { creditAdjustment: mode === "add" ? amount : -amount };
    if (!confirm(`${mode === "reset" ? `Reset to the ${PLAN_BY_SLUG[target.plan].name} allowance` : `${mode} ${amount.toLocaleString()} credits`} for ${target.email}?`)) return;
    await mutate(target, data, "Credit balance updated.");
    setCreditValue("");
  };

  if (isLoading) return <div className="h-96 rounded-xl bg-card border border-border animate-pulse" />;
  if (isError) return <Card className="p-8 text-center text-destructive">Unable to load users. Confirm your admin access and try again.</Card>;

  const normalized = search.trim().toLowerCase();
  const filtered = (users ?? []).filter((item) => !normalized || item.email.toLowerCase().includes(normalized) || (item.name ?? "").toLowerCase().includes(normalized));
  const selected = (users ?? []).find((item) => item.id === selectedId) ?? null;

  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border gap-4 md:flex-row md:items-center md:justify-between">
        <div><CardTitle>User management</CardTitle><p className="text-sm text-muted-foreground mt-1">{filtered.length} of {users?.length ?? 0} accounts</p></div>
        <div className="relative w-full md:w-80"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email" /></div>
      </CardHeader>
      <div className="overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>Name / email</TableHead><TableHead>Plan</TableHead><TableHead>Credits</TableHead><TableHead>Admin</TableHead><TableHead>Stripe customer</TableHead><TableHead>Subscription</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>{filtered.map((item) => <TableRow key={item.id} className="cursor-pointer hover:bg-primary/5" onClick={() => setSelectedId(item.id)}>
          <TableCell><div className="font-medium text-white">{item.name || "No name"}</div><div className="text-xs text-muted-foreground">{item.email}</div></TableCell>
          <TableCell><Badge variant={item.plan === "free" ? "secondary" : "default"}>{PLAN_BY_SLUG[item.plan].name}</Badge></TableCell>
          <TableCell>{item.credits.toLocaleString()}</TableCell><TableCell>{item.isAdmin ? "Yes" : "No"}</TableCell>
          <TableCell className="max-w-40 truncate font-mono text-xs" title={item.stripeCustomerId ?? ""}>{item.stripeCustomerId ?? "—"}</TableCell>
          <TableCell className="max-w-40 truncate font-mono text-xs" title={item.stripeSubscriptionId ?? ""}>{item.stripeSubscriptionId ?? "—"}</TableCell>
          <TableCell><Badge variant={item.accountStatus === "active" ? "success" : "destructive"}>{item.accountStatus}</Badge></TableCell>
        </TableRow>)}</TableBody>
      </Table></div>
    </Card>
    <Card className="h-fit xl:sticky xl:top-6">
      {!selected ? <CardContent className="py-16 text-center text-muted-foreground">Select a user to view and edit their account.</CardContent> : <>
        <CardHeader className="border-b border-border"><CardTitle>{selected.name || "User details"}</CardTitle><p className="text-sm text-muted-foreground break-all">{selected.email}</p></CardHeader>
        <CardContent className="space-y-6 pt-6">
          <section className="space-y-2"><label className="text-sm font-semibold">Plan</label><Select value={selected.plan} onValueChange={(value) => changePlan(selected, value as PlanSlug)} disabled={updateMutation.isPending}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PLAN_CATALOG.map(plan => <SelectItem value={plan.slug} key={plan.slug}>{plan.name} — {plan.credits.toLocaleString()} credits</SelectItem>)}</SelectContent></Select></section>
          <section className="space-y-2"><label className="text-sm font-semibold flex gap-2"><Coins className="h-4 w-4" />Credits ({selected.credits.toLocaleString()})</label><Input inputMode="numeric" value={creditValue} onChange={(e) => setCreditValue(e.target.value)} placeholder="Whole number" /><div className="grid grid-cols-2 gap-2"><Button variant="outline" size="sm" onClick={() => editCredits(selected,"add")}>Add</Button><Button variant="outline" size="sm" onClick={() => editCredits(selected,"subtract")}>Subtract</Button><Button variant="outline" size="sm" onClick={() => editCredits(selected,"set")}>Set exact</Button><Button variant="outline" size="sm" onClick={() => editCredits(selected,"reset")}>Reset plan</Button></div></section>
          <section className="space-y-2"><label className="text-sm font-semibold">Account status</label><Select value={selected.accountStatus} onValueChange={(status) => { if (confirm(`${status === "disabled" ? "Disable" : "Activate"} ${selected.email}?`)) void mutate(selected, { accountStatus: status as "active" | "disabled" }, `Account is now ${status}.`); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="disabled">Disabled</SelectItem></SelectContent></Select></section>
          <Button variant="outline" className="w-full" onClick={() => changeAdmin(selected)}>{selected.isAdmin ? <ShieldOff className="h-4 w-4 mr-2" /> : <UserCheck className="h-4 w-4 mr-2" />}{selected.isAdmin ? "Remove admin" : "Grant admin"}</Button>
          <section className="space-y-2"><p className="text-sm font-semibold">User testing</p><div className="grid grid-cols-2 gap-2"><Button size="sm" variant="outline" onClick={() => adminUserAction(selected, "impersonate", toast)}>Login as user</Button><Button size="sm" variant="outline" onClick={() => adminUserAction(selected, "refresh-credits", toast)}>Force credits</Button><Button size="sm" variant="outline" onClick={() => adminUserAction(selected, "sync-subscription", toast)}>Sync Stripe</Button><Button size="sm" variant="outline" disabled title="Requires a stored Stripe event ID">Resend webhook</Button></div></section>
          <section className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2 text-xs"><p className="font-semibold text-sm">Stripe (read only)</p><Info label="Customer" value={selected.stripeCustomerId} /><Info label="Subscription" value={selected.stripeSubscriptionId} /><Info label="Status" value={selected.subscriptionStatus} /><Info label="Billing interval" value={selected.billingInterval} /></section>
        </CardContent>
      </>}
    </Card>
  </div>;
}

async function adminUserAction(target: AdminUser, action: "impersonate" | "refresh-credits" | "sync-subscription", toast: ReturnType<typeof useToast>["toast"]) {
  if (!confirm(`${action.replace("-", " ")} for ${target.email}?`)) return;
  const response = await fetch(`/api/admin/users/${target.id}/${action}`, { method: "POST", headers: authHeaders() });
  const body = await response.json();
  if (!response.ok) { toast({ title: "Action failed", description: body.error, variant: "destructive" }); return; }
  if (action === "impersonate") {
    sessionStorage.setItem("quae_admin_token", localStorage.getItem("quae_token") ?? "");
    localStorage.setItem("quae_token", body.token);
    window.location.assign("/studio");
    return;
  }
  toast({ title: "Action complete", description: action === "refresh-credits" ? "Credits reset to plan allowance." : "Subscription synchronized." });
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return <div><span className="text-muted-foreground">{label}: </span><span className="font-mono break-all">{value || "Not available"}</span></div>;
}
