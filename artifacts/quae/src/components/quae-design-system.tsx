import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageShell({ children, className }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("quae-page", className)}><div className="quae-container">{children}</div></div>;
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: ReactNode; description: ReactNode; action?: ReactNode }) {
  return <header className="relative flex flex-col gap-6 overflow-hidden rounded-3xl border border-white/[.06] bg-gradient-to-br from-[#20304A] via-[#18263D] to-[#18263D] p-7 shadow-2xl shadow-slate-950/25 sm:flex-row sm:items-center sm:justify-between sm:p-10 before:absolute before:-right-20 before:-top-24 before:h-64 before:w-64 before:rounded-full before:bg-violet-500/10 before:blur-3xl">
    <div><p className="quae-eyebrow">{eyebrow}</p><h1 className="quae-title">{title}</h1><p className="quae-description">{description}</p></div>
    {action && <div className="relative shrink-0">{action}</div>}
  </header>;
}

export function PremiumCard({ children, className, elevated = false }: HTMLAttributes<HTMLDivElement> & { elevated?: boolean }) {
  return <div className={cn(elevated ? "quae-card-elevated" : "quae-card", className)}>{children}</div>;
}

export function SectionHeading({ title, description }: { title: ReactNode; description?: ReactNode }) {
  return <div><h2 className="quae-section-title">{title}</h2>{description && <p className="mt-1 text-sm leading-6 text-[#AAB6CA]">{description}</p>}</div>;
}

export function StatusPill({ children, className }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("quae-status", className)}>{children}</span>;
}

export function ActionButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn("inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-500 px-5 text-sm font-bold text-white shadow-lg shadow-violet-950/30 transition hover:from-violet-500 hover:to-indigo-400 disabled:pointer-events-none disabled:opacity-50", className)} {...props} />;
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: ReactNode; description: ReactNode; action?: ReactNode }) {
  return <div className="quae-empty">{icon}<h3 className="mt-4 text-lg font-bold text-white">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#AAB6CA]">{description}</p>{action && <div className="mt-6">{action}</div>}</div>;
}
