import { RequireAdmin } from "@/components/auth-guard";
import { useGetAdminStats, useListAdminUsers, useUpdateAdminUser, useDeleteAdminUser, getListAdminUsersQueryKey, getGetAdminStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Users, Film, PlayCircle, UserPlus, Shield, ShieldOff, Trash2, Copy, Download, Mail, Send } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { AdminUserUpdatePlan } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function Admin() {
  return (
    <RequireAdmin>
      <div className="min-h-screen bg-background p-8 text-foreground">
        <div className="max-w-7xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
            <p className="text-muted-foreground mt-2">Manage users and view platform statistics.</p>
          </div>

          <AdminStats />

          <Tabs defaultValue="users">
            <TabsList className="mb-4">
              <TabsTrigger value="users"><Users className="h-4 w-4 mr-2" />Users</TabsTrigger>
              <TabsTrigger value="subscribers"><Mail className="h-4 w-4 mr-2" />Subscribers</TabsTrigger>
              <TabsTrigger value="broadcast"><Send className="h-4 w-4 mr-2" />Broadcast</TabsTrigger>
            </TabsList>
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
                <SelectItem value="paid">Paid Plans Only (Starter / Pro / Agency)</SelectItem>
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
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="starter">Starter</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
              <SelectItem value="agency">Agency</SelectItem>
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

function AdminUsersTable() {
  const { data: users, isLoading } = useListAdminUsers();
  const updateMutation = useUpdateAdminUser();
  const deleteMutation = useDeleteAdminUser();
  const queryClient = useQueryClient();
  const [filterPlan, setFilterPlan] = useState<string>("all");

  const handleToggleAdmin = async (id: string, currentIsAdmin: boolean) => {
    await updateMutation.mutateAsync({ id, data: { isAdmin: !currentIsAdmin } });
    queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
  };

  const handleUpdatePlan = async (id: string, plan: string) => {
    await updateMutation.mutateAsync({ id, data: { plan: plan as AdminUserUpdatePlan } });
    queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this user?")) {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
    }
  };

  if (isLoading) {
    return <div className="h-96 rounded-xl bg-card border border-border animate-pulse" />;
  }

  const filteredUsers = users?.filter(u => filterPlan === "all" || u.plan === filterPlan) || [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b border-border py-4">
        <div>
          <CardTitle>Users</CardTitle>
        </div>
        <div className="w-40">
          <Select value={filterPlan} onValueChange={setFilterPlan}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Plans</SelectItem>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="starter">Starter</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
              <SelectItem value="agency">Agency</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <div className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Credits</TableHead>
              <TableHead>Projects</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="font-medium text-white">{u.name || "No name"}</div>
                  <div className="text-sm text-muted-foreground">{u.email}</div>
                  {u.isAdmin && <Badge variant="secondary" className="mt-1 text-[10px] h-4">Admin</Badge>}
                </TableCell>
                <TableCell>
                  <Select value={u.plan} onValueChange={(val) => handleUpdatePlan(u.id, val)}>
                    <SelectTrigger className="h-8 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="starter">Starter</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="agency">Agency</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>{u.credits}</TableCell>
                <TableCell>{u.projectCount}</TableCell>
                <TableCell>{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    title={u.isAdmin ? "Remove Admin" : "Make Admin"}
                    onClick={() => handleToggleAdmin(u.id, u.isAdmin)}
                  >
                    {u.isAdmin ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(u.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filteredUsers.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
