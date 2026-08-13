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
    <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Top Nav */}
      <header className="h-14 border-b border-border bg-card/80 backdrop-blur-md flex items-center px-6 gap-6 shrink-0 z-20">
        {/* Logo */}
        <WouterLink href="/studio" className="flex items-center gap-2 font-bold text-base tracking-tight text-white hover:opacity-80 transition-opacity mr-2">
          <img src="/images/logo-icon.png" alt="Quae" className="h-7 w-7 rounded-md object-cover" />
          Quae
        </WouterLink>

        {/* Nav Links */}
        <nav className="flex items-center gap-1">
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
        <div className="ml-auto flex items-center gap-3">
          {adminToken && <Button size="sm" variant="destructive" onClick={returnToAdmin}>Exit impersonation</Button>}
          {/* Credits */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm font-semibold">
            <span className="text-base">🪙</span>
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-white transition-colors border border-transparent hover:border-border"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>

          {/* Avatar */}
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold">
            {(user?.name || user?.email || "U")[0].toUpperCase()}
          </div>

          {/* Upgrade */}
          <WouterLink href="/studio/billing">
            <Button size="sm" className="font-semibold px-4 gap-1.5">
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
        "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
        isActive
          ? "text-white border-b-2 border-primary rounded-none pb-[5px]"
          : "text-muted-foreground hover:text-white"
      )}
    >
      {label}
    </WouterLink>
  );
}
