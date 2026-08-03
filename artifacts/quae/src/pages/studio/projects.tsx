import { RequireAuth } from "@/components/auth-guard";
import { useListProjects, useGetProjectStats, useDeleteProject, getListProjectsQueryKey, getGetProjectStatsQueryKey } from "@workspace/api-client-react";
import { usePrivateImageUrl } from "@/hooks/use-private-image-url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "wouter";
import { FolderKanban, Clock, Trash2, Video, CheckCircle2, Zap, Film, PlusCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function StudioProjects() {
  return (
    <RequireAuth>
      <div className="min-h-full bg-[#050507] overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-black tracking-[0.2em] uppercase text-violet-400/70 mb-3">
                My Projects
              </p>
              <h1 className="text-3xl font-black text-white tracking-tight leading-tight">All Videos</h1>
              <p className="text-white/40 mt-1.5 text-sm">Your complete library of AI-generated video ads.</p>
            </div>
            <Link href="/studio">
              <Button className="h-10 px-5 bg-violet-600 hover:bg-violet-500 rounded-xl font-bold text-sm shadow-lg shadow-violet-600/25 gap-2 transition-all">
                <PlusCircle className="h-4 w-4" /> New Video
              </Button>
            </Link>
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
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 rounded-2xl border border-white/[0.06] bg-[#0c0c0f] animate-pulse" />
        ))}
      </div>
    );
  }

  const total = stats.creditsUsed + stats.creditsRemaining;
  const creditPct = total > 0 ? Math.min(100, Math.round((stats.creditsRemaining / total) * 100)) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div className="rounded-2xl border border-violet-600/20 bg-violet-600/[0.06] p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black tracking-[0.2em] uppercase text-violet-400/70 mb-2">Total Projects</p>
            <p className="text-3xl font-black text-white tracking-tight">{stats.total}</p>
          </div>
          <div className="h-12 w-12 rounded-2xl bg-violet-600/10 border border-violet-600/20 flex items-center justify-center">
            <FolderKanban className="h-6 w-6 text-violet-400" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black tracking-[0.2em] uppercase text-emerald-400/70 mb-2">Completed</p>
            <p className="text-3xl font-black text-white tracking-tight">{stats.byStatus.completed}</p>
          </div>
          <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Video className="h-6 w-6 text-emerald-400" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-[#0c0c0f] p-5">
        <p className="text-[11px] font-black tracking-[0.2em] uppercase text-violet-400/70 mb-3">Credits Remaining</p>
        <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden mb-2">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 transition-all duration-700"
            style={{ width: `${creditPct}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-white/30">{stats.creditsUsed.toLocaleString()} used</span>
          <span className="text-white/60 font-semibold">{stats.creditsRemaining.toLocaleString()} left</span>
        </div>
      </div>
    </div>
  );
}

function ProjectsList() {
  const { data: projects, isLoading } = useListProjects();
  const deleteMutation = useDeleteProject();
  const queryClient = useQueryClient();

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (confirm("Delete this project permanently?")) {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetProjectStatsQueryKey() });
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="h-56 rounded-2xl border border-white/[0.06] bg-[#0c0c0f] animate-pulse" />
        ))}
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/[0.08] bg-[#0c0c0f]/50 py-24 flex flex-col items-center text-center px-6">
        <div className="h-20 w-20 rounded-2xl bg-violet-600/10 border border-violet-600/20 flex items-center justify-center mb-5">
          <Film className="h-10 w-10 text-violet-400/40" />
        </div>
        <h3 className="text-lg font-black text-white mb-2 tracking-tight">No projects yet</h3>
        <p className="text-white/30 text-sm mb-8 max-w-xs">
          Create your first AI video ad. Just add your product details and let the AI do the rest.
        </p>
        <Link href="/studio">
          <Button className="h-10 px-6 bg-violet-600 hover:bg-violet-500 rounded-xl font-bold text-sm shadow-lg shadow-violet-600/20 gap-2">
            <PlusCircle className="h-4 w-4" /> Create Video
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map((p) => (
        <ProjectCard key={p.id} project={p} onDelete={handleDelete} />
      ))}
    </div>
  );
}

function ProjectCard({
  project: p,
  onDelete,
}: {
  project: {
    id: string;
    title: string;
    status: string;
    createdAt: string;
    description?: string | null;
    platform?: string | null;
    duration?: string | null;
    thumbnailUrl?: string | null;
    productImageUrl?: string | null;
  };
  onDelete: (e: React.MouseEvent, id: string) => void;
}) {
  const videoThumbnail = p.thumbnailUrl && !p.thumbnailUrl.startsWith("fal:") ? p.thumbnailUrl : null;
  const resolvedProductImage = usePrivateImageUrl(videoThumbnail ? null : p.productImageUrl);
  const displayImage = videoThumbnail ?? resolvedProductImage ?? null;
  const hasThumbnail = !!displayImage;
  const isProductImage = !videoThumbnail && !!resolvedProductImage;

  return (
    <Link href={`/studio/projects/${p.id}`}>
      <div className="group rounded-2xl border border-white/[0.06] bg-[#0c0c0f] hover:border-violet-600/30 hover:shadow-[0_8px_40px_rgba(0,0,0,0.5)] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer flex flex-col overflow-hidden h-full">

        {/* Thumbnail / Hero */}
        <div className="relative h-40 bg-[#0a0a0d] overflow-hidden flex-shrink-0">
          {hasThumbnail ? (
            <>
              <img
                src={displayImage!}
                alt={p.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              {isProductImage && (
                <div className="absolute top-3 left-3">
                  <span className="px-2 py-0.5 rounded-md text-[9px] font-black tracking-widest uppercase bg-black/60 text-white/50 backdrop-blur-md border border-white/[0.08]">
                    Product
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="h-12 w-12 rounded-2xl bg-violet-600/10 border border-violet-600/20 flex items-center justify-center">
                {p.status === "completed"
                  ? <CheckCircle2 className="h-6 w-6 text-emerald-400/60" />
                  : p.status === "processing"
                  ? <Clock className="h-6 w-6 text-amber-400/60" />
                  : <Zap className="h-6 w-6 text-violet-400/60" />
                }
              </div>
            </div>
          )}
          {/* Cinematic gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0f] via-black/20 to-transparent" />

          {/* Status badge pinned top-right */}
          <div className="absolute top-3 right-3">
            <StatusBadge status={p.status} />
          </div>

          {/* Platform/duration chips bottom-left */}
          {(p.platform || p.duration) && (
            <div className="absolute bottom-3 left-3 flex gap-1.5">
              {p.platform && (
                <span className="px-2 py-0.5 rounded-md text-[9px] font-black tracking-widest uppercase bg-black/60 text-white/60 backdrop-blur-md border border-white/[0.08]">
                  {p.platform}
                </span>
              )}
              {p.duration && (
                <span className="px-2 py-0.5 rounded-md text-[9px] font-black tracking-widest bg-black/60 text-white/60 backdrop-blur-md border border-white/[0.08]">
                  {p.duration}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-4 space-y-2">
          <h3 className="font-bold text-white text-sm leading-snug group-hover:text-violet-300 transition-colors line-clamp-1">
            {p.title}
          </h3>
          {p.description && (
            <p className="text-[11px] text-white/30 line-clamp-2 leading-relaxed">
              {p.description}
            </p>
          )}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-white/20 flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              {new Date(p.createdAt).toLocaleDateString()}
            </span>
            <button
              className="h-7 w-7 rounded-lg flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors z-10"
              onClick={(e) => onDelete(e, p.id)}
              aria-label="Delete project"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          {p.status === "failed" && (
            <p className="text-[10px] text-red-400/70 font-medium">Credits refunded · Click to retry</p>
          )}
        </div>
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black tracking-widest uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 backdrop-blur-md">
          Done
        </span>
      );
    case "processing":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black tracking-widest uppercase bg-violet-500/20 text-violet-300 border border-violet-500/30 backdrop-blur-md">
          Rendering
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black tracking-widest uppercase bg-red-500/20 text-red-400 border border-red-500/30 backdrop-blur-md">
          Failed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black tracking-widest uppercase bg-white/[0.08] text-white/40 border border-white/[0.1] backdrop-blur-md">
          Draft
        </span>
      );
  }
}
