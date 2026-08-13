import * as React from "react"
import { Link as WouterLink, useLocation } from "wouter"
import { cn } from "@/lib/utils"
import { ShieldCheck, LogOut, CreditCard, Sparkles } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const adminToken = sessionStorage.getItem("quae_admin_token");

  const returnToAdmin = () => {
    if (!adminToken) return;
    localStorage.setItem("quae_token", adminToken);
    sessionStorage.removeItem("quae_admin_token");
    window.location.assign("/admin");
  };

  return (
    <div className="quae-app flex h-screen w-full flex-col overflow-hidden bg-[#0D1728] text-foreground">
      {/* Top Nav */}
      <header className="z-20 flex shrink-0 flex-wrap items-center gap-x-5 gap-y-3 border-b border-white/[.08] bg-[#111D31]/95 px-4 py-3 shadow-[0_16px_50px_rgba(2,8,23,.28)] backdrop-blur-xl lg:min-h-[76px] lg:flex-nowrap lg:px-7">
        {/* Logo */}
        <WouterLink href="/studio/dashboard" className="mr-2 flex items-center gap-3 text-white transition-opacity hover:opacity-90">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-[#5B7CFA] shadow-lg shadow-violet-950/30"><Sparkles className="h-5 w-5" /></span>
          <span><span className="block text-lg font-extrabold leading-none tracking-tight">Quae</span><span className="mt-1 block text-[9px] font-bold uppercase tracking-[.18em] text-[#8494AC]">AI Marketing Dept.</span></span>
        </WouterLink>

        {/* Nav Links */}
        <nav aria-label="Primary navigation" className="order-3 -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1 overflow-x-auto px-1 pb-0.5 lg:order-none lg:mx-0 lg:w-auto lg:flex-1 lg:px-0">
          <NavLink href="/studio/dashboard" label="Dashboard" />
          <NavLink href="/studio" label="Studio" exact />
          <NavLink href="/templates" label="Templates" />
          <NavLink href="/studio/projects" label="My Videos" />
          <NavLink href="/studio/business" label="Business" />
          <NavLink href="/studio/brand-kit" label="Brand Kit" />
          <NavLink href="/studio/products" label="Products" />
          <NavLink href="/studio/billing" label="Billing" />
          <NavLink href="/studio/settings" label="Settings" />
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          {adminToken && <Button size="sm" variant="destructive" onClick={returnToAdmin}>Exit impersonation</Button>}
          {/* Credits */}
          <div className="flex items-center gap-2 rounded-xl border border-violet-300/15 bg-[#20304A] px-3 py-2 text-sm font-bold text-slate-100 shadow-lg shadow-slate-950/15">
            <span aria-hidden="true" className="text-violet-300">✦</span>
            {(user?.credits ?? 0).toLocaleString()} credits
          </div>

          {/* Admin */}
          {user?.isAdmin && (
            <WouterLink href="/admin">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors">
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin
              </button>
            </WouterLink>
          )}

          {/* Sign Out */}
          <button
            onClick={() => logout()}
            className="hidden items-center gap-1.5 rounded-md border border-transparent px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border hover:text-white xl:flex"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>

          {/* Avatar */}
          <div className="hidden h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-[#263754] to-[#20304A] text-sm font-bold text-white shadow-lg sm:flex">
            {(user?.name || user?.email || "U")[0].toUpperCase()}
          </div>

          {/* Upgrade */}
          <WouterLink href="/studio/billing">
            <Button size="sm" className="hidden h-10 gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-[#5B7CFA] px-5 font-bold shadow-lg shadow-violet-950/30 sm:inline-flex">
              <CreditCard className="h-3.5 w-3.5" /> Upgrade
            </Button>
          </WouterLink>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        {children}
      </main>
    </div>
  )
}

function NavLink({ href, label, exact }: { href: string; label: string; exact?: boolean }) {
  const [location] = useLocation();
  const isActive = exact ? location === href : location.startsWith(href);

  return (
    <WouterLink
      href={href}
      className={cn(
        "relative shrink-0 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all",
        isActive
          ? "bg-[#263754] text-white shadow-lg shadow-slate-950/20 after:absolute after:inset-x-4 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-violet-400"
          : "text-[#B9C5D8] hover:bg-white/[.05] hover:text-white"
      )}
    >
      {label}
    </WouterLink>
  );
}
