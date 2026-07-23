import { RequireAuth } from "@/components/auth-guard";
import { useListProjects, useGetProjectStats, useDeleteProject, getListProjectsQueryKey, getGetProjectStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "wouter";
import { FolderKanban, Clock, Trash2, ExternalLink, Video } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";

export default function StudioProjects() {
  return (
    <RequireAuth>
      <div className="p-8 h-full overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My Projects</h1>
            <p className="text-muted-foreground mt-2">Manage your video ad campaigns.</p>
          </div>
          
          <ProjectStatsBar />
          <ProjectsList />
        </div>
      </div>
    </RequireAuth>
  );
}

function ProjectStatsBar() {
  const { data: stats, isLoading } = useGetProjectStats();

  if (isLoading || !stats) {
    return <div className="h-24 rounded-xl bg-card border border-border animate-pulse" />;
  }

  const creditUsagePercent = (stats.creditsUsed / (stats.creditsUsed + stats.creditsRemaining)) * 100 || 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Projects</p>
              <h2 className="text-3xl font-bold mt-2">{stats.total}</h2>
            </div>
            <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center">
              <FolderKanban className="h-6 w-6 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Completed Videos</p>
              <h2 className="text-3xl font-bold mt-2">{stats.byStatus.completed}</h2>
            </div>
            <div className="h-12 w-12 bg-emerald-500/10 rounded-full flex items-center justify-center">
              <Video className="h-6 w-6 text-emerald-500" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <p className="text-sm font-medium text-muted-foreground mb-4">Credit Usage</p>
          <Progress value={creditUsagePercent} className="mb-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{stats.creditsUsed} used</span>
            <span>{stats.creditsRemaining} remaining</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectsList() {
  const { data: projects, isLoading } = useListProjects();
  const deleteMutation = useDeleteProject();
  const queryClient = useQueryClient();

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault(); // Prevent navigating to details
    if (confirm("Delete this project permanently?")) {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetProjectStatsQueryKey() });
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => <div key={i} className="h-48 rounded-xl bg-card border border-border animate-pulse" />)}
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="text-center py-24 border border-dashed border-border rounded-xl">
        <FolderKanban className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
        <h3 className="text-lg font-medium text-white mb-2">No projects yet</h3>
        <p className="text-muted-foreground mb-6">Create your first AI video ad to get started.</p>
        <Link href="/studio">
          <Button>Create Video</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {projects.map((p) => (
        <Link key={p.id} href={`/studio/projects/${p.id}`}>
          <Card className="hover:border-primary/50 transition-colors cursor-pointer group flex flex-col h-full">
            <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-lg leading-tight group-hover:text-primary transition-colors">
                  {p.title}
                </CardTitle>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(p.createdAt).toLocaleDateString()}
                </div>
              </div>
              <StatusBadge status={p.status} />
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-sm text-muted-foreground line-clamp-2">
                {p.description || "No description provided."}
              </p>
              <div className="flex gap-2 mt-4">
                {p.platform && (
                  <Badge variant="outline" className="text-[10px] uppercase bg-secondary/50">
                    {p.platform}
                  </Badge>
                )}
                {p.duration && (
                  <Badge variant="outline" className="text-[10px] bg-secondary/50">
                    {p.duration}
                  </Badge>
                )}
              </div>
            </CardContent>
            <CardFooter className="pt-0 justify-between">
               <div className="text-sm font-medium text-primary flex items-center gap-1 group-hover:underline">
                 View Details <ExternalLink className="h-3 w-3" />
               </div>
               <Button 
                 variant="ghost" 
                 size="icon" 
                 className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 z-10"
                 onClick={(e) => handleDelete(e, p.id)}
               >
                 <Trash2 className="h-4 w-4" />
               </Button>
            </CardFooter>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed': return <Badge variant="success">Completed</Badge>;
    case 'processing': return <Badge className="bg-primary/20 text-primary hover:bg-primary/30 border-transparent">Processing</Badge>;
    case 'failed': return <Badge variant="destructive">Failed</Badge>;
    default: return <Badge variant="outline" className="text-muted-foreground">Draft</Badge>;
  }
}
