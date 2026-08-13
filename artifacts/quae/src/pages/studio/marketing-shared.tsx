import type { ReactNode } from "react";
import { RequireAuth } from "@/components/auth-guard";
import { usePrivateImageUrl } from "@/hooks/use-private-image-url";
import { privateImageUrl } from "@/lib/marketing-api";
import { ActionButton, PageHeader, PageShell, PremiumCard, SectionHeading, StatusPill } from "@/components/quae-design-system";

export { PremiumCard, SectionHeading, StatusPill };

export function MarketingPage({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return <RequireAuth><PageShell><PageHeader eyebrow={eyebrow} title={title} description={description} /><div className="mt-8">{children}</div></PageShell></RequireAuth>;
}
export const fieldClass = "w-full rounded-xl border border-white/10 bg-[#172033] px-4 py-3 text-sm text-slate-50 shadow-inner shadow-slate-950/10 transition hover:border-violet-300/30 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/25 disabled:bg-[#131c2e]";
export function Field({ label, children, wide, hint }: { label: string; children: ReactNode; wide?: boolean; hint?: string }) { return <label className={wide ? "md:col-span-2 space-y-2" : "space-y-2"}><span className="text-xs font-semibold text-slate-200">{label}</span>{children}{hint && <span className="block text-xs text-[#AAB6CA]">{hint}</span>}</label>; }
export function SaveButton({ saving, children = "Save changes" }: { saving: boolean; children?: ReactNode }) { return <ActionButton disabled={saving}>{saving ? "Saving…" : children}</ActionButton>; }

export function MarketingImage({ objectPath, className }: { objectPath: string; className?: string }) { const url = usePrivateImageUrl(privateImageUrl(objectPath)); return url ? <img src={url} className={className} /> : <div className={`${className ?? ""} animate-pulse bg-white/[.05]`} />; }
