import { useEffect, useRef, useState } from "react";
import { RequireAuth } from "@/components/auth-guard";
import { useParams, Link, useLocation } from "wouter";
import { useGetProject, useDeleteProject, getGetProjectQueryKey, getGetProjectQueryOptions } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ArrowLeft, Clock, Trash2, Code, AlignLeft, RefreshCw, Download, VideoOff, RotateCcw, Mail, Zap, CheckCircle2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExpandedScript } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

// Estimated render seconds per model (shown in the waiting UI)
const MODEL_ESTIMATES: Record<string, number> = {
  ovi:   120,
  wan:   180,
  kling: 240,
  veo3:  480,
};

function useElapsed(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!active) { setElapsed(0); startRef.current = Date.now(); return; }
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [active]);

  return elapsed;
}

function fmt(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function StudioProjectDetail() {
  const params = useParams();
  const id = params.id as string;
  const { data: project, isLoading } = useQuery({ ...getGetProjectQueryOptions(id), enabled: !!id });
  const deleteMutation = useDeleteProject();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [videoError, setVideoError] = useState(false);
  const [rerendering, setRerendering] = useState(false);
  const { toast } = useToast();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isProcessing = project?.status === "processing";
  const elapsed = useElapsed(isProcessing);

  // Poll every 10s while processing (was 3s — slower polling is fine, reduces server load)
  useEffect(() => {
    if (isProcessing) {
      pollRef.current = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
      }, 10_000);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isProcessing, id, queryClient]);

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

  const modelKey = (project as any).renderingModelId?.replace('quae-v1', 'ovi') ?? 'ovi';
  const estimateSec = MODEL_ESTIMATES[modelKey] ?? 180;
  const pct = Math.min(100, Math.round((elapsed / estimateSec) * 100));

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
      const token = localStorage.getItem("quae_token");
      const res = await fetch(`/api/projects/${id}/rerender`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error ${res.status}`);
      }
      await queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
      toast({ title: "Re-render started", description: "Your video is queued. Check back in a few minutes." });
    } catch (err: any) {
      toast({ title: "Re-render failed", description: err.message || "Could not start the render.", variant: "destructive" });
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
                <Button variant="outline" onClick={handleRerender} disabled={rerendering || isProcessing}>
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

              {/* Video / Processing area */}
              <Card className="border-border bg-black overflow-hidden">
                <div className="aspect-video w-full flex items-center justify-center relative">

                  {/* ─── PROCESSING ─── */}
                  {isProcessing && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 bg-[#080808]">
                      {/* Animated gradient orb */}
                      <div className="relative mb-8">
                        <div className="h-24 w-24 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
                          <div className="h-16 w-16 rounded-full bg-primary/30 flex items-center justify-center">
                            <Zap className="h-8 w-8 text-primary animate-bounce" />
                          </div>
                        </div>
                        <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-spin" style={{ animationDuration: '3s' }} />
                      </div>

                      <p className="text-white font-bold text-xl mb-1">Rendering your video…</p>
                      <p className="text-white/50 text-sm mb-6">AI video generation takes a few minutes. You can leave this page — it'll be here when you come back.</p>

                      {/* Progress bar */}
                      <div className="w-full max-w-xs mb-3">
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-1000"
                            style={{ width: `${Math.max(pct, 3)}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between w-full max-w-xs text-xs text-white/40 mb-6">
                        <span>Elapsed: {fmt(elapsed)}</span>
                        <span>Est. ~{fmt(estimateSec)}</span>
                      </div>

                      {/* Escape hatch */}
                      <div className="flex flex-col items-center gap-2">
                        <Link href="/studio/projects">
                          <Button variant="outline" size="sm" className="border-white/10 text-white/60 hover:text-white">
                            ← Back to Projects — I'll check later
                          </Button>
                        </Link>
                        <p className="text-[11px] text-white/30 flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          We'll email you when it's done
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ─── COMPLETED ─── */}
                  {project.status === 'completed' && project.videoUrl && !videoError && (
                    <video
                      key={project.videoUrl}
                      src={project.videoUrl}
                      controls
                      playsInline
                      autoPlay
                      className="w-full h-full object-contain"
                      onError={() => setVideoError(true)}
                      onLoadedData={() => setVideoError(false)}
                    />
                  )}

                  {project.status === 'completed' && videoError && (
                    <div className="absolute inset-0 bg-secondary/20 flex flex-col items-center justify-center text-center px-8">
                      <VideoOff className="h-12 w-12 text-muted-foreground mb-4 opacity-60" />
                      <p className="text-white font-semibold mb-1">Preview unavailable in browser</p>
                      <p className="text-sm text-muted-foreground mb-4">Use the Download button to watch your rendered video.</p>
                      <a href={project.videoUrl!} download target="_blank" rel="noreferrer">
                        <Button size="sm"><Download className="h-4 w-4 mr-2" />Download MP4</Button>
                      </a>
                    </div>
                  )}

                  {/* ─── FAILED ─── */}
                  {project.status === 'failed' && (
                    <div className="absolute inset-0 bg-secondary/20 flex flex-col items-center justify-center text-center px-8">
                      <VideoOff className="h-12 w-12 text-destructive mb-4 opacity-80" />
                      <p className="text-white font-semibold mb-2">Render failed</p>
                      <p className="text-sm text-muted-foreground mb-4">The AI model encountered an error. Your credits have been refunded.</p>
                      <Button size="sm" onClick={handleRerender} disabled={rerendering}>
                        <RotateCcw className="h-4 w-4 mr-2" /> Try Again
                      </Button>
                    </div>
                  )}
                </div>
              </Card>

              {/* Success download banner */}
              {project.status === 'completed' && project.videoUrl && (
                <div className="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                    <div>
                      <p className="text-white font-semibold text-sm">Video ready</p>
                      <p className="text-white/50 text-xs">Download and publish to your platform</p>
                    </div>
                  </div>
                  <a href={project.videoUrl} target="_blank" rel="noreferrer">
                    <Button size="sm" className="font-bold">
                      <Download className="h-4 w-4 mr-2" /> Download MP4
                    </Button>
                  </a>
                </div>
              )}

              {/* Script breakdown */}
              {expandedScript && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlignLeft className="h-5 w-5 text-primary" /> Script Used for This Render
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
                            <div className="w-12 text-xs font-mono text-muted-foreground pt-1 flex-shrink-0">{scene.duration}</div>
                            <div>
                              <p className="text-sm text-white mb-1">{scene.description}</p>
                              <p className="text-xs text-primary">{scene.visualDirection}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {expandedScript.voiceoverText && (
                      <div>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Voiceover</p>
                        <p className="text-sm text-white/70 leading-relaxed">{expandedScript.voiceoverText}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Code className="h-4 w-4" /> Project Details
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
                    <span className="text-xs text-muted-foreground block mb-1">AI Model</span>
                    <Badge variant="outline" className="capitalize">{(project as any).renderingModelId || 'Ovi'}</Badge>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">Description</span>
                    <p className="text-sm text-white line-clamp-4">{project.description}</p>
                  </div>
                </CardContent>
              </Card>
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
    case 'processing': return <Badge className="bg-primary/20 text-primary border-transparent animate-pulse">Processing</Badge>;
    case 'failed': return <Badge variant="destructive">Failed</Badge>;
    default: return <Badge variant="outline" className="text-muted-foreground">Draft</Badge>;
  }
}
