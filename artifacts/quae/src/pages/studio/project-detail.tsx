import { useEffect, useRef, useState } from "react";
import { RequireAuth } from "@/components/auth-guard";
import { useParams, Link, useLocation } from "wouter";
import { useGetProject, useDeleteProject, getGetProjectQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ArrowLeft, Clock, Trash2, Code, AlignLeft, RefreshCw, Download, VideoOff, RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ExpandedScript, customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export default function StudioProjectDetail() {
  const params = useParams();
  const id = params.id as string;
  const { data: project, isLoading } = useGetProject(id, { query: { enabled: !!id } });
  const deleteMutation = useDeleteProject();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [videoError, setVideoError] = useState(false);
  const [rerendering, setRerendering] = useState(false);
  const { toast } = useToast();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-poll every 3s while processing
  useEffect(() => {
    if (project?.status === "processing") {
      pollRef.current = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
      }, 3000);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [project?.status, id, queryClient]);

  if (isLoading) {
    return (
      <RequireAuth>
        <div className="flex h-full items-center justify-center">
          <Spinner className="h-8 w-8 text-primary" />
        </div>
      </RequireAuth>
    );
  }

  if (!project) {
    return <RequireAuth><div className="p-8 text-center text-muted-foreground">Project not found</div></RequireAuth>;
  }

  let expandedScript: ExpandedScript | null = null;
  try {
    if (project.expandedScript) expandedScript = JSON.parse(project.expandedScript);
  } catch (e) {}

  const handleDelete = async () => {
    if (confirm("Delete this project?")) {
      await deleteMutation.mutateAsync({ id });
      setLocation("/studio/projects");
    }
  };

  const handleRerender = async () => {
    setRerendering(true);
    setVideoError(false);
    try {
      await customFetch(`/api/projects/${id}/rerender`, { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
      toast({ title: "Re-render started", description: "Your video is being rendered. This page will refresh automatically." });
    } catch {
      toast({ title: "Re-render failed", description: "Could not start the render. Check that your SHOTSTACK_API_KEY is set.", variant: "destructive" });
    } finally {
      setRerendering(false);
    }
  };

  return (
    <RequireAuth>
      <div className="p-8 h-full overflow-y-auto bg-background">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
            <Link href="/studio/projects" className="hover:text-white flex items-center gap-1 transition-colors">
              <ArrowLeft className="h-4 w-4" /> Back to Projects
            </Link>
          </div>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white mb-2">{project.title}</h1>
              <div className="flex items-center gap-3">
                <StatusBadge status={project.status} />
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {new Date(project.createdAt).toLocaleString()}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              {project.expandedScript && (
                <Button variant="outline" onClick={handleRerender} disabled={rerendering || project.status === "processing"}>
                  <RotateCcw className={`h-4 w-4 mr-2 ${rerendering ? "animate-spin" : ""}`} />
                  {rerendering ? "Starting…" : "Re-render"}
                </Button>
              )}
              <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 pt-4">
            <div className="md:col-span-2 space-y-6">
              
              {/* Video Preview Area */}
              <Card className="border-border bg-black">
                <div className="aspect-video w-full flex items-center justify-center relative">
                  {project.status === 'completed' && project.videoUrl && !videoError ? (
                    <video
                      key={project.videoUrl}
                      src={project.videoUrl}
                      controls
                      playsInline
                      className="w-full h-full object-contain"
                      onError={() => setVideoError(true)}
                      onLoadedData={() => setVideoError(false)}
                    />
                  ) : project.status === 'completed' && videoError ? (
                    <div className="absolute inset-0 bg-secondary/20 flex flex-col items-center justify-center text-center px-8">
                      <VideoOff className="h-12 w-12 text-muted-foreground mb-4 opacity-60" />
                      <p className="text-white font-semibold mb-1">Preview unavailable in browser</p>
                      <p className="text-sm text-muted-foreground mb-4">Use the Download button to watch your rendered video.</p>
                      <a href={project.videoUrl!} download target="_blank" rel="noreferrer">
                        <Button size="sm"><Download className="h-4 w-4 mr-2" />Download MP4</Button>
                      </a>
                    </div>
                  ) : project.status === 'processing' ? (
                    <div className="absolute inset-0 bg-secondary/20 flex flex-col items-center justify-center text-center px-8">
                      <RefreshCw className="h-10 w-10 text-primary animate-spin mb-4" />
                      <p className="text-white font-medium">Rendering your video…</p>
                      <p className="text-xs text-muted-foreground mt-2">This page refreshes automatically. Usually takes 1–3 minutes.</p>
                    </div>
                  ) : project.status === 'failed' ? (
                    <div className="absolute inset-0 bg-secondary/20 flex flex-col items-center justify-center text-center px-8">
                      <VideoOff className="h-12 w-12 text-destructive mb-4 opacity-80" />
                      <p className="text-white font-semibold mb-1">Render failed</p>
                      <p className="text-sm text-muted-foreground">The video render encountered an error. Check that your SHOTSTACK_API_KEY secret is set, then try again.</p>
                    </div>
                  ) : (
                    <div className="absolute inset-0 bg-secondary/20 flex flex-col items-center justify-center text-muted-foreground">
                      <RefreshCw className="h-12 w-12 mb-2 opacity-50" />
                      <p>Queued for rendering</p>
                    </div>
                  )}
                </div>
              </Card>

              {expandedScript && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlignLeft className="h-5 w-5 text-primary" /> Generated Script
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-4 bg-primary/5 border border-primary/20 rounded-md">
                      <p className="font-medium italic text-white mb-2">Hook</p>
                      <p className="text-muted-foreground">"{expandedScript.hook}"</p>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold text-white mb-3">Scenes</h4>
                      <div className="space-y-3">
                        {expandedScript.scenes.map((scene, i) => (
                          <div key={i} className="flex gap-4 p-3 rounded-md bg-secondary/30">
                            <div className="w-12 text-xs font-mono text-muted-foreground pt-1">{scene.duration}</div>
                            <div>
                              <p className="text-sm text-white mb-1">{scene.description}</p>
                              <p className="text-xs text-primary">{scene.visualDirection}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Code className="h-4 w-4" /> Project Metadata
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">Platform</span>
                    <Badge variant="outline" className="uppercase">{project.platform || 'Unknown'}</Badge>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">Duration</span>
                    <Badge variant="outline">{project.duration || 'Unknown'}</Badge>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">Description</span>
                    <p className="text-sm text-white line-clamp-4">{project.description}</p>
                  </div>
                </CardContent>
              </Card>

              {project.status === 'completed' && project.videoUrl && (
                <Card className="border-primary/50 bg-primary/5">
                  <CardContent className="p-6">
                    <h3 className="font-bold text-white mb-2">Export Ready</h3>
                    <p className="text-sm text-muted-foreground mb-4">Your video is ready to download and publish.</p>
                    {/* Cross-origin Shotstack URLs block the download attribute — open in new tab instead */}
                    <a href={project.videoUrl} target="_blank" rel="noreferrer">
                      <Button className="w-full font-bold">
                        <Download className="h-4 w-4 mr-2" /> Open MP4
                      </Button>
                    </a>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

        </div>
      </div>
    </RequireAuth>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed': return <Badge variant="success">Completed</Badge>;
    case 'processing': return <Badge className="bg-primary/20 text-primary border-transparent">Processing</Badge>;
    case 'failed': return <Badge variant="destructive">Failed</Badge>;
    default: return <Badge variant="outline" className="text-muted-foreground">Draft</Badge>;
  }
}
