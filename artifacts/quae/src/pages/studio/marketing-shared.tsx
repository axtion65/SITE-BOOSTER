import type { ReactNode } from "react";
import { RequireAuth } from "@/components/auth-guard";
import { usePrivateImageUrl } from "@/hooks/use-private-image-url";
import { privateImageUrl } from "@/lib/marketing-api";

export function MarketingPage({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return <RequireAuth><div className="min-h-full bg-[#050507] text-white"><div className="max-w-6xl mx-auto px-6 py-10">
    <p className="text-[11px] font-black tracking-[0.2em] uppercase text-violet-400/70 mb-2">{eyebrow}</p>
    <h1 className="text-3xl font-black tracking-tight">{title}</h1><p className="text-white/40 mt-2 max-w-2xl text-sm">{description}</p>
    <div className="mt-8">{children}</div>
  </div></div></RequireAuth>;
}
export const fieldClass = "w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.09] text-white placeholder-white/20 text-sm focus:outline-none focus:border-violet-500/60";
export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) { return <label className={wide ? "md:col-span-2 space-y-1.5" : "space-y-1.5"}><span className="text-[11px] font-bold uppercase tracking-wider text-white/45">{label}</span>{children}</label>; }
export function SaveButton({ saving, children = "Save changes" }: { saving: boolean; children?: ReactNode }) { return <button disabled={saving} className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm font-bold shadow-lg shadow-violet-600/20">{saving ? "Saving…" : children}</button>; }

export function MarketingImage({ objectPath, className }: { objectPath: string; className?: string }) { const url = usePrivateImageUrl(privateImageUrl(objectPath)); return url ? <img src={url} className={className} /> : <div className={`${className ?? ""} animate-pulse bg-white/[.05]`} />; }
