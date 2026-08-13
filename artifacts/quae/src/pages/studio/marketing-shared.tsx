import type { ReactNode } from "react";
import { RequireAuth } from "@/components/auth-guard";
import { usePrivateImageUrl } from "@/hooks/use-private-image-url";
import { privateImageUrl } from "@/lib/marketing-api";

export function MarketingPage({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return <RequireAuth><div
    className="min-h-full text-white"
    style={{ background: "radial-gradient(circle at 8% 0%, rgba(124,58,237,.22), transparent 34%), radial-gradient(circle at 92% 4%, rgba(14,165,233,.13), transparent 30%), linear-gradient(180deg,#0a0f1f 0%,#100b1d 55%,#080b14 100%)" }}
  ><div className="max-w-6xl mx-auto px-6 py-10">
    <p className="text-[11px] font-black tracking-[0.2em] uppercase text-violet-300 mb-2">{eyebrow}</p>
    <h1 className="text-3xl font-black tracking-tight text-white">{title}</h1><p className="text-slate-300/70 mt-2 max-w-2xl text-sm">{description}</p>
    <div className="mt-8">{children}</div>
  </div></div></RequireAuth>;
}
export const fieldClass = "w-full px-4 py-2.5 rounded-xl bg-[#191b2b] border border-[#3b3650] text-white placeholder-slate-400/45 text-sm shadow-inner shadow-black/15 transition-colors hover:border-violet-400/45 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20";
export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) { return <label className={wide ? "md:col-span-2 space-y-1.5" : "space-y-1.5"}><span className="text-[11px] font-bold uppercase tracking-wider text-slate-300/70">{label}</span>{children}</label>; }
export function SaveButton({ saving, children = "Save changes" }: { saving: boolean; children?: ReactNode }) { return <button disabled={saving} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-500 hover:from-violet-500 hover:to-indigo-400 disabled:opacity-50 text-sm font-bold shadow-lg shadow-violet-900/35 transition-all">{saving ? "Saving…" : children}</button>; }

export function MarketingImage({ objectPath, className }: { objectPath: string; className?: string }) { const url = usePrivateImageUrl(privateImageUrl(objectPath)); return url ? <img src={url} className={className} /> : <div className={`${className ?? ""} animate-pulse bg-white/[.05]`} />; }
