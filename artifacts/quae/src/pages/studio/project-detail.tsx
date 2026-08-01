import { useEffect, useRef, useState } from "react";
import { RequireAuth } from "@/components/auth-guard";
import { useParams, Link, useLocation } from "wouter";
import { useGetProject, useDeleteProject, getGetProjectQueryKey, getGetProjectQueryOptions } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  ArrowLeft, Clock, Trash2, Code, AlignLeft, RotateCcw, Download,
  VideoOff, Mail, Zap, CheckCircle2, ImageIcon, Film,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExpandedScript } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

// Realistic estimates based on actual fal.ai queue times
const MODEL_ESTIMATES: Record<string, number> = {
  'ovi':       300,
  'quae-v1':   300,
  'wan':       360,
  'kling':     420,
  'kling-1.6': 420,
  'veo3':      600,
};

const MODEL_CLIP_LENGTH: Record<string, string> = {
  'ovi':       '~5 sec clip',
  'quae-v1':   '~5 sec clip',
  'wan':       '~8–10 sec clip',
  'kling':     '~10 sec clip',
  'kling-1.6': '~10 sec clip',
  'veo3':      '~8 sec clip',
};

function useElapsed(active: boolean, createdAt?: string): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) { setElapsed(0); return; }
    const startMs = createdAt ? new Date(createdAt).getTime() : Date.now();
    const tick = () => setElapsed(Math.floor((Date.now() - startMs) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active, createdAt]);
  return elapsed;
}

function fmt(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function StatusPill({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          Completed
        </span>
      );
    case "processing":
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase bg-violet-500/20 text-violet-300 border border-violet-500/30 animate-pulse">
          Rendering
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase bg-red-500/20 text-red-400 border border-red-500/30">
          Failed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase bg-white/[0.08] text-white/40 border border-white/[0.1]">
          Draft
        </span>
      );
  }
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
  const elapsed = useElapsed(isProcessing, project?.createdAt);

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
        <div className="min-h-full bg-[#050507] flex items-center justify-center">
          <Spinner className="h-8 w-8 text-violet-400" />
        </div>
      </RequireAuth>
    );
  }

  if (!project) {
    return (
      <RequireAuth>
        <div className="min-h-full bg-[#050507] flex items-center justify-center">
          <p className="text-white/30">Project not found</p>
        </div>
      </RequireAuth>
    );
  }

  let expandedScript: ExpandedScript | null = null;
  try {
    if (project.expandedScript) expandedScript = JSON.parse(project.expandedScript);
  } catch (e) {}

  const modelKey = (project as any).renderingModelId ?? 'ovi';
  const estimateSec = MODEL_ESTIMATES[modelKey] ?? 360;
  const clipLength = MODEL_CLIP_LENGTH[modelKey] ?? '~5 sec clip';
  const pct = isProcessing ? Math.min(88, Math.round((elapsed / estimateSec) * 100)) : 100;
  const overEstimate = isProcessing && elapsed > estimateSec;

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
      <div className="min-h-full bg-[#050507] overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">

          {/* Back nav */}
          <Link href="/studio/projects" className="inline-flex items-center gap-1.5 text-[11px] font-black tracking-[0.2em] uppercase text-white/30 hover:text-violet-400 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Projects
          </Link>

          {/* Page header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black tracking-[0.2em] uppercase text-violet-400/70 mb-2">Project</p>
              <h1 className="text-3xl font-black text-white tracking-tight leading-tight">{project.title}</h1>
              <div className="flex items-center gap-3 mt-2.5">
                <StatusPill status={project.status} />
                <span className="text-[11px] text-white/25 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(project.createdAt).toLocaleString()}
                </span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {project.expandedScript && (
                <Button
                  variant="outline"
                  onClick={handleRerender}
                  disabled={rerendering || isProcessing}
                  className="h-9 px-4 rounded-xl border-white/[0.08] bg-white/[0.03] text-white/60 hover:text-white hover:border-violet-500/40 text-sm font-bold gap-2 transition-all"
                >
                  <RotateCcw className={`h-4 w-4 ${rerendering ? "animate-spin" : ""}`} />
                  {rerendering ? "Starting…" : "Re-render"}
                </Button>
              )}
              <Button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="h-9 px-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:border-red-500/40 text-sm font-bold gap-2 transition-all"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </div>
          </div>

          {/* Main grid */}
          <div className="grid md:grid-cols-3 gap-6">

            {/* LEFT — video + script */}
            <div className="md:col-span-2 space-y-5">

              {/* ─── VIDEO HERO BLOCK ─── */}
              <div className="rounded-2xl border border-white/[0.06] bg-[#0c0c0f] overflow-hidden">
                <div className="aspect-video w-full flex items-center justify-center relative bg-black">

                  {/* PROCESSING */}
                  {isProcessing && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 bg-[#080808]">
                      <div className="relative mb-8">
                        <div className="h-24 w-24 rounded-full bg-violet-600/20 flex items-center justify-center animate-pulse">
                          <div className="h-16 w-16 rounded-full bg-violet-600/30 flex items-center justify-center">
                            <Zap className="h-8 w-8 text-violet-400 animate-bounce" />
                          </div>
                        </div>
                        <div className="absolute inset-0 rounded-full border-2 border-violet-500/30 animate-spin" style={{ animationDuration: '3s' }} />
                      </div>

                      <p className="text-white font-black text-xl mb-1">Rendering your video…</p>
                      <p className="text-white/40 text-sm mb-5 max-w-sm">
                        AI video generation takes several minutes. You can leave this page — it'll be here when you come back.
                      </p>

                      <div className="mb-5 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs text-white/40 max-w-xs">
                        <span className="text-white/70 font-semibold">Output: {clipLength}</span>
                        {" "}— AI video models generate short clips regardless of script length.
                        {modelKey !== 'kling' && modelKey !== 'kling-1.6' && (
                          <span className="text-violet-400"> Upgrade to Kling for 10-sec clips.</span>
                        )}
                      </div>

                      <div className="w-full max-w-xs mb-2">
                        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-1000 ${overEstimate ? 'bg-amber-400' : 'bg-gradient-to-r from-violet-600 to-fuchsia-500'}`}
                            style={{ width: `${Math.max(pct, 3)}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between w-full max-w-xs text-[11px] mb-1">
                        <span className="text-white/30">Elapsed: {fmt(elapsed)}</span>
                        <span className={overEstimate ? "text-amber-400 font-semibold" : "text-white/30"}>
                          {overEstimate ? "Taking longer than usual…" : `Est. ~${fmt(estimateSec)}`}
                        </span>
                      </div>
                      {overEstimate && (
                        <p className="text-[11px] text-white/20 mb-4 max-w-xs">Still in queue — fal.ai can be slower during peak hours. Hang tight.</p>
                      )}

                      <div className="flex flex-col items-center gap-2 mt-2">
                        <Link href="/studio/projects">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-white/[0.08] bg-white/[0.03] text-white/50 hover:text-white rounded-xl font-bold"
                          >
                            ← Back to Projects — I'll check later
                          </Button>
                        </Link>
                        <p className="text-[11px] text-white/20 flex items-center gap-1">
                          <Mail className="h-3 w-3" /> We'll email you when it's done
                        </p>
                      </div>
                    </div>
                  )}

                  {/* COMPLETED — video player */}
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

                  {/* COMPLETED — video error fallback */}
                  {project.status === 'completed' && videoError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
                      <VideoOff className="h-12 w-12 text-white/20 mb-4" />
                      <p className="text-white font-bold mb-1">Preview unavailable in browser</p>
                      <p className="text-sm text-white/40 mb-5">Use the Download button to watch your rendered video.</p>
                      <a href={project.videoUrl!} download target="_blank" rel="noreferrer">
                        <Button className="rounded-xl bg-violet-600 hover:bg-violet-500 font-bold gap-2">
                          <Download className="h-4 w-4" /> Download MP4
                        </Button>
                      </a>
                    </div>
                  )}

                  {/* FAILED */}
                  {project.status === 'failed' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
                      <div className="h-16 w-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-5">
                        <VideoOff className="h-8 w-8 text-red-400" />
                      </div>
                      <p className="text-white font-black text-lg mb-1">Render failed</p>
                      <p className="text-sm text-white/40 mb-5">The AI model encountered an error. Your credits have been refunded.</p>
                      <Button
                        onClick={handleRerender}
                        disabled={rerendering}
                        className="rounded-xl bg-violet-600 hover:bg-violet-500 font-bold gap-2"
                      >
                        <RotateCcw className="h-4 w-4" /> Try Again
                      </Button>
                    </div>
                  )}

                  {/* DRAFT / no video */}
                  {project.status !== 'completed' && project.status !== 'processing' && project.status !== 'failed' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
                      <div className="h-16 w-16 rounded-2xl bg-violet-600/10 border border-violet-600/20 flex items-center justify-center mb-5">
                        <Film className="h-8 w-8 text-violet-400/40" />
                      </div>
                      <p className="text-white/30 text-sm">No video yet</p>
                    </div>
                  )}
                </div>

                {/* Cinematic hero footer — download bar */}
                {project.status === 'completed' && project.videoUrl && (
                  <div className="flex items-center justify-between px-5 py-3.5 border-t border-white/[0.06]">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-white font-bold text-sm leading-none mb-0.5">Video ready</p>
                        <p className="text-[11px] text-white/30">Download and publish to your platform</p>
                      </div>
                    </div>
                    <a href={project.videoUrl} target="_blank" rel="noreferrer">
                      <Button className="h-9 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 font-bold text-sm gap-2 shadow-lg shadow-violet-600/25">
                        <Download className="h-4 w-4" /> Download MP4
                      </Button>
                    </a>
                  </div>
                )}
              </div>

              {/* Script breakdown */}
              {expandedScript && (
                <div className="rounded-2xl border border-white/[0.06] bg-[#0c0c0f] overflow-hidden">
                  <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/[0.06]">
                    <div className="h-7 w-7 rounded-lg bg-violet-600/10 border border-violet-600/20 flex items-center justify-center">
                      <AlignLeft className="h-3.5 w-3.5 text-violet-400" />
                    </div>
                    <p className="text-[11px] font-black tracking-[0.2em] uppercase text-violet-400/70">Script Used for This Render</p>
                  </div>
                  <div className="p-5 space-y-5">
                    {/* Hook */}
                    <div className="p-4 rounded-xl bg-violet-600/[0.06] border border-violet-600/[0.12]">
                      <p className="text-[11px] font-black tracking-[0.2em] uppercase text-violet-400/70 mb-2">Hook</p>
                      <p className="text-white/70 italic text-sm leading-relaxed">"{expandedScript.hook}"</p>
                    </div>

                    {/* Scenes */}
                    <div>
                      <p className="text-[11px] font-black tracking-[0.2em] uppercase text-white/30 mb-3">Scenes</p>
                      <div className="space-y-2.5">
                        {expandedScript.scenes.map((scene, i) => (
                          <div key={i} className="flex gap-4 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                            <div className="w-12 text-[11px] font-black text-white/30 pt-0.5 flex-shrink-0 font-mono">{scene.duration}</div>
                            <div>
                              <p className="text-sm text-white mb-1 leading-snug">{scene.description}</p>
                              <p className="text-xs text-violet-400/80">{scene.visualDirection}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Voiceover */}
                    {expandedScript.voiceoverText && (
                      <div>
                        <p className="text-[11px] font-black tracking-[0.2em] uppercase text-white/30 mb-2">Voiceover</p>
                        <p className="text-sm text-white/50 leading-relaxed">{expandedScript.voiceoverText}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT — details sidebar */}
            <div className="space-y-5">

              {/* Project details card */}
              <div className="rounded-2xl border border-white/[0.06] bg-[#0c0c0f] overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/[0.06]">
                  <div className="h-7 w-7 rounded-lg bg-violet-600/10 border border-violet-600/20 flex items-center justify-center">
                    <Code className="h-3.5 w-3.5 text-violet-400" />
                  </div>
                  <p className="text-[11px] font-black tracking-[0.2em] uppercase text-violet-400/70">Project Details</p>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <p className="text-[11px] font-black tracking-[0.2em] uppercase text-white/25 mb-1.5">Platform</p>
                    <span className="inline-flex px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase bg-white/[0.06] text-white/60 border border-white/[0.08]">
                      {project.platform || 'Unknown'}
                    </span>
                  </div>
                  <div>
                    <p className="text-[11px] font-black tracking-[0.2em] uppercase text-white/25 mb-1.5">Duration</p>
                    <span className="inline-flex px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase bg-white/[0.06] text-white/60 border border-white/[0.08]">
                      {project.duration || 'Unknown'}
                    </span>
                  </div>
                  <div>
                    <p className="text-[11px] font-black tracking-[0.2em] uppercase text-white/25 mb-1.5">AI Model</p>
                    <span className="inline-flex px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase bg-violet-600/10 text-violet-400 border border-violet-600/20">
                      {(project as any).renderingModelId || 'Ovi'}
                    </span>
                  </div>
                  <div>
                    <p className="text-[11px] font-black tracking-[0.2em] uppercase text-white/25 mb-1.5">Description</p>
                    <p className="text-sm text-white/50 leading-relaxed line-clamp-5">{project.description}</p>
                  </div>
                </div>
              </div>

              {/* Product image card */}
              {project.productImageUrl && (
                <div className="rounded-2xl border border-white/[0.06] bg-[#0c0c0f] overflow-hidden">
                  <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/[0.06]">
                    <div className="h-7 w-7 rounded-lg bg-violet-600/10 border border-violet-600/20 flex items-center justify-center">
                      <ImageIcon className="h-3.5 w-3.5 text-violet-400" />
                    </div>
                    <p className="text-[11px] font-black tracking-[0.2em] uppercase text-violet-400/70">Product Image</p>
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-black/40">
                      <img
                        src={project.productImageUrl}
                        alt="Product image used for this render"
                        className="w-full object-contain max-h-48"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                    <p className="text-[11px] text-white/25 flex items-center gap-1.5">
                      <ImageIcon className="h-3 w-3 flex-shrink-0" />
                      Image conditioning applied to this render
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </RequireAuth>
  );
}
