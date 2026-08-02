import { useState } from "react";
import { RequireAuth } from "@/components/auth-guard";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { Spinner } from "@/components/ui/spinner";
import { User, Mail, Shield, Bell, Trash2, LogOut, Check } from "lucide-react";

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("quae_token");
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

export default function StudioSettings() {
  return (
    <RequireAuth>
      <SettingsContent />
    </RequireAuth>
  );
}

function SettingsContent() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState((user as any)?.name ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savedProfile, setSavedProfile] = useState(false);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setSavedProfile(false);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: authHeader(),
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const updated = await res.json();
        // Refresh the auth context so the header avatar updates immediately
        queryClient.setQueryData(getGetMeQueryKey(), updated);
        setSavedProfile(true);
        toast({ title: "Profile updated" });
        setTimeout(() => setSavedProfile(false), 2000);
      } else {
        toast({ title: "Failed to save profile", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to save profile", variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  const currentPlan = (user as any)?.plan ?? "free";
  const credits = (user as any)?.credits ?? 0;
  const email = (user as any)?.email ?? "";
  const joinedAt = (user as any)?.createdAt
    ? new Date((user as any).createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;

  return (
    <div className="min-h-full bg-[#050507] text-white">
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-10">

        {/* Header */}
        <div>
          <p className="text-[11px] font-black tracking-[0.2em] uppercase text-violet-400/70 mb-2">Account</p>
          <h1 className="text-3xl font-black text-white tracking-tight">Settings</h1>
          <p className="text-white/35 mt-1 text-sm">Manage your account details and preferences.</p>
        </div>

        {/* Profile */}
        <section>
          <SectionLabel icon={<User className="h-3.5 w-3.5" />} label="Profile" />
          <div className="p-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] space-y-5">
            {/* Avatar row */}
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-xl font-black text-violet-300">
                {(name || email || "U")[0].toUpperCase()}
              </div>
              <div>
                <div className="text-white font-bold">{name || email}</div>
                <div className="text-xs text-white/30">{joinedAt ? `Joined ${joinedAt}` : "Quae member"}</div>
              </div>
            </div>

            <div className="h-px bg-white/[0.06]" />

            {/* Name field */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-white/40 uppercase tracking-wider">Display name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/20 text-sm focus:outline-none focus:border-violet-500/50 focus:bg-white/[0.06] transition-all"
              />
            </div>

            {/* Email field (read-only) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-white/40 uppercase tracking-wider">Email address</label>
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] text-white/40 text-sm">
                <Mail className="h-4 w-4 shrink-0" />
                {email}
              </div>
              <p className="text-[11px] text-white/20">Email cannot be changed.</p>
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition-all shadow-lg shadow-violet-600/20 disabled:opacity-50"
            >
              {savingProfile ? (
                <Spinner className="h-4 w-4" />
              ) : savedProfile ? (
                <Check className="h-4 w-4" />
              ) : null}
              {savedProfile ? "Saved!" : "Save changes"}
            </button>
          </div>
        </section>

        {/* Plan & Credits */}
        <section>
          <SectionLabel icon={<Shield className="h-3.5 w-3.5" />} label="Plan" />
          <div className="p-6 rounded-2xl border border-white/[0.08] bg-white/[0.02]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white font-black capitalize text-lg">{currentPlan} Plan</div>
                <div className="text-[11px] text-white/35 mt-0.5">
                  {credits.toLocaleString()} credits remaining
                </div>
              </div>
              <a
                href="/studio/billing"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition-all shadow-lg shadow-violet-600/20"
              >
                {currentPlan === "free" ? "Upgrade" : "Manage plan"}
              </a>
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section>
          <SectionLabel icon={<Bell className="h-3.5 w-3.5" />} label="Notifications" />
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] divide-y divide-white/[0.05]">
            <ToggleRow
              label="Video ready"
              description="Get an email when your video finishes rendering."
              defaultChecked={true}
            />
            <ToggleRow
              label="Monthly credit summary"
              description="A monthly recap of your credit usage."
              defaultChecked={false}
            />
            <ToggleRow
              label="Product updates"
              description="New features, templates, and model releases."
              defaultChecked={true}
            />
          </div>
        </section>

        {/* Danger zone */}
        <section>
          <SectionLabel icon={<Trash2 className="h-3.5 w-3.5 text-red-400/70" />} label="Danger zone" labelClass="text-red-400/70" />
          <div className="rounded-2xl border border-red-500/10 bg-red-500/[0.02] divide-y divide-white/[0.04]">
            <div className="p-5 flex items-center justify-between">
              <div>
                <div className="text-white text-sm font-semibold">Sign out</div>
                <div className="text-[11px] text-white/30">End your current session.</div>
              </div>
              <button
                onClick={() => logout()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/10 border border-white/[0.08] text-sm font-semibold text-white/60 hover:text-white transition-all"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
            <div className="p-5 flex items-center justify-between">
              <div>
                <div className="text-red-400 text-sm font-semibold">Delete account</div>
                <div className="text-[11px] text-white/30">Permanently remove your account and all data. This cannot be undone.</div>
              </div>
              <button
                onClick={() => toast({ title: "Contact support to delete your account.", variant: "destructive" })}
                className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-sm font-semibold text-red-400 hover:text-red-300 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

function SectionLabel({
  icon,
  label,
  labelClass = "text-violet-400/70",
}: {
  icon?: React.ReactNode;
  label: string;
  labelClass?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon && <span className={labelClass}>{icon}</span>}
      <p className={`text-[11px] font-black tracking-[0.2em] uppercase ${labelClass}`}>{label}</p>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  defaultChecked,
}: {
  label: string;
  description: string;
  defaultChecked: boolean;
}) {
  const [enabled, setEnabled] = useState(defaultChecked);
  return (
    <div className="px-5 py-4 flex items-center justify-between gap-4">
      <div>
        <div className="text-white text-sm font-semibold">{label}</div>
        <div className="text-[11px] text-white/30">{description}</div>
      </div>
      <button
        onClick={() => setEnabled(v => !v)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 transition-colors duration-200 ${
          enabled ? "bg-violet-600 border-violet-600" : "bg-white/10 border-white/10"
        }`}
        role="switch"
        aria-checked={enabled}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${
            enabled ? "translate-x-3.5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
