import { RequireAdmin } from "@/components/auth-guard";
import { useGetAdminStats, useListAdminUsers, useUpdateAdminUser, useDeleteAdminUser, getListAdminUsersQueryKey, getGetAdminStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Users, Film, PlayCircle, UserPlus, Shield, ShieldOff, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { AdminUserUpdatePlan } from "@workspace/api-client-react";

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
          <AdminUsersTable />
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
              <SelectItem value="creator">Creator</SelectItem>
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
                      <SelectItem value="creator">Creator</SelectItem>
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
