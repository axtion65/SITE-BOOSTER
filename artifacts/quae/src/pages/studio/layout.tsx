import * as React from "react"
import { Link as WouterLink, useLocation } from "wouter"
import { cn } from "@/lib/utils"
import { ShieldCheck, LogOut, CreditCard } from "lucide-react"
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
    <div className="quae-app flex h-screen w-full flex-col overflow-hidden bg-[#0B1220] text-foreground">
      {/* Top Nav */}
      <header className="z-20 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/[.07] bg-[#101827]/95 px-4 py-2 shadow-lg shadow-slate-950/20 backdrop-blur-xl lg:min-h-16 lg:flex-nowrap lg:px-6">
        {/* Logo */}
        <WouterLink href="/studio" className="flex items-center gap-2 font-bold text-base tracking-tight text-white hover:opacity-80 transition-opacity mr-2">
          <img src="/images/logo-icon.png" alt="Quae" className="h-7 w-7 rounded-md object-cover" />
          Quae
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
          <div className="flex items-center gap-1.5 rounded-full border border-violet-300/15 bg-[#1D2940] px-3 py-1.5 text-sm font-semibold text-slate-200 shadow-inner">
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
          <div className="hidden h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-sm font-bold text-white sm:flex">
            {(user?.name || user?.email || "U")[0].toUpperCase()}
          </div>

          {/* Upgrade */}
          <WouterLink href="/studio/billing">
            <Button size="sm" className="hidden gap-1.5 px-4 font-semibold sm:inline-flex">
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
        "relative shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-violet-500/10 text-white shadow-inner shadow-violet-400/5 after:absolute after:inset-x-3 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-violet-400"
          : "text-[#AAB6CA] hover:bg-white/[.04] hover:text-white"
      )}
    >
      {label}
    </WouterLink>
  );
}
