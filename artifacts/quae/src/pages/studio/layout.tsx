import * as React from "react"
import { Link as WouterLink } from "wouter"
import { cn } from "@/lib/utils"
import { Film, LogOut, LayoutTemplate, Settings, FolderKanban, ShieldCheck } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  
  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-foreground">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <WouterLink href="/studio" className="flex items-center gap-2 font-bold text-xl tracking-tight text-white hover:opacity-80 transition-opacity">
            <div className="h-8 w-8 bg-primary rounded-md flex items-center justify-center">
              <Film className="h-4 w-4 text-white" />
            </div>
            Quae.ai
          </WouterLink>
        </div>
        
        <div className="flex-1 py-6 flex flex-col gap-1 px-3 overflow-y-auto">
          <NavItem href="/studio" icon={<Film className="h-4 w-4" />} label="Create Video" />
          <NavItem href="/studio/projects" icon={<FolderKanban className="h-4 w-4" />} label="My Projects" />
          <NavItem href="/templates" icon={<LayoutTemplate className="h-4 w-4" />} label="Templates" />
          {user?.isAdmin && (
            <NavItem href="/admin" icon={<ShieldCheck className="h-4 w-4" />} label="Admin Panel" />
          )}
        </div>
        
        <div className="p-4 border-t border-border">
          <div className="mb-4 px-2">
            <p className="text-sm font-medium text-white">{user?.name || user?.email}</p>
            <p className="text-xs text-muted-foreground uppercase mt-1 tracking-wider">{user?.plan} plan</p>
          </div>
          <button 
            onClick={() => logout()}
            className="w-full flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground hover:text-white transition-colors rounded-md hover:bg-secondary"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>
      
      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        {children}
      </main>
    </div>
  )
}

function NavItem({ href, icon, label }: { href: string, icon: React.ReactNode, label: string }) {
  return (
    <WouterLink 
      href={href} 
      className={({ isActive }) => cn(
        "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
        isActive 
          ? "bg-primary/10 text-primary" 
          : "text-muted-foreground hover:text-white hover:bg-secondary"
      )}
    >
      {icon}
      {label}
    </WouterLink>
  );
}
