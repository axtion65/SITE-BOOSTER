import { useState } from "react";
import { useListTemplates } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { Sparkles, ArrowRight, Lock, CheckCircle2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

const CATEGORIES = ["All", "TikTok Ad", "UGC Review", "Before & After", "Shopify Promo", "Amazon Listing", "Trending"];

// Visual DNA for each template type — gradient colors + icon suggestion
const TEMPLATE_VISUALS: Record<string, {
  bg: string;
  accent: string;
  label: string;
  emoji: string;
  bars: string[];
}> = {
  tiktok:       { bg: "from-[#010101] via-[#1a0030] to-[#010101]", accent: "#69C9D0",    label: "VIRAL FORMAT",       emoji: "⚡", bars: ["bg-[#ff0050]","bg-[#69C9D0]","bg-white"] },
  ugc:          { bg: "from-[#0f0f0f] via-[#1c1c1c] to-[#0f0f0f]", accent: "#e0e0e0",    label: "AUTHENTIC REVIEW",   emoji: "📱", bars: ["bg-white/80","bg-white/50","bg-white/30"] },
  "before-after":{ bg: "from-[#0a0a1a] via-[#1a1a3a] to-[#0a0a1a]", accent: "#a78bfa",   label: "TRANSFORMATION",     emoji: "✨", bars: ["bg-gray-600","bg-violet-500","bg-violet-300"] },
  demo:         { bg: "from-[#001a10] via-[#002a18] to-[#001a10]", accent: "#34d399",    label: "LIVE DEMO",          emoji: "🎯", bars: ["bg-emerald-600","bg-emerald-400","bg-emerald-200"] },
  unboxing:     { bg: "from-[#1a1000] via-[#2a1a00] to-[#1a1000]", accent: "#fbbf24",    label: "UNBOXING REVEAL",    emoji: "📦", bars: ["bg-amber-700","bg-amber-400","bg-amber-200"] },
  "flash-sale": { bg: "from-[#1a0000] via-[#2a0000] to-[#1a0000]", accent: "#f87171",    label: "URGENCY DRIVEN",     emoji: "🔥", bars: ["bg-red-700","bg-red-500","bg-red-300"] },
  amazon:       { bg: "from-[#0a0a00] via-[#1a1800] to-[#0a0a00]", accent: "#f59e0b",    label: "LISTING VIDEO",      emoji: "⭐", bars: ["bg-amber-600","bg-amber-400","bg-amber-200"] },
  "brand-story":{ bg: "from-[#0a001a] via-[#120028] to-[#0a001a]", accent: "#c084fc",    label: "BRAND FILM",         emoji: "🎬", bars: ["bg-purple-800","bg-purple-500","bg-purple-300"] },
  testimonial:  { bg: "from-[#001018] via-[#001a24] to-[#001018]", accent: "#38bdf8",    label: "SOCIAL PROOF",       emoji: "💬", bars: ["bg-sky-700","bg-sky-400","bg-sky-200"] },
  shopify:      { bg: "from-[#001a12] via-[#00261a] to-[#001a12]", accent: "#4ade80",    label: "SHOPIFY PROMO",      emoji: "🛍️", bars: ["bg-green-700","bg-green-400","bg-green-200"] },
  tutorial:     { bg: "from-[#0a0818] via-[#12102a] to-[#0a0818]", accent: "#818cf8",    label: "EDUCATIONAL",        emoji: "📖", bars: ["bg-indigo-700","bg-indigo-400","bg-indigo-200"] },
  instagram:    { bg: "from-[#1a0010] via-[#200018] to-[#1a0010]", accent: "#f472b6",    label: "AESTHETIC REEL",     emoji: "✦",  bars: ["bg-pink-700","bg-pink-400","bg-pink-200"] },
};

function getVisual(thumbnailGradient: string) {
  return TEMPLATE_VISUALS[thumbnailGradient] ?? TEMPLATE_VISUALS["demo"];
}

interface Template {
  id: string;
  name: string;
  category: string;
  platform: string;
  duration: string;
  templateType?: string;
  description: string;
  exampleHook?: string;
  structure?: string[];
  thumbnailGradient?: string;
  isPremium?: boolean;
}

function TemplateCard({ t, onUse, userPlan }: { t: Template; onUse: () => void; userPlan: string }) {
  const vis = getVisual(t.thumbnailGradient ?? "demo");
  const isPremiumLocked = t.isPremium && userPlan === "free";

  return (
    <div className="group relative flex flex-col rounded-2xl border border-white/8 bg-[#0c0c0f] overflow-hidden hover:border-white/20 transition-all duration-300 hover:shadow-[0_0_40px_rgba(124,58,237,0.15)]">
      {/* Thumbnail preview */}
      <div className={`relative aspect-[9/16] bg-gradient-to-b ${vis.bg} overflow-hidden flex-shrink-0`}>
        {/* Simulated phone chrome top bar */}
        <div className="absolute top-3 left-0 right-0 flex items-center justify-between px-3 z-20">
          <div className="flex items-center gap-1.5">
            {t.isPremium ? (
              <Badge className="bg-amber-400 text-black text-[9px] font-black tracking-wide border-none h-5">
                <Sparkles className="h-2.5 w-2.5 mr-0.5" /> PRO
              </Badge>
            ) : (
              <Badge className="bg-white/10 text-white/60 text-[9px] font-bold tracking-wide border-white/10 h-5">
                FREE
              </Badge>
            )}
          </div>
          <Badge
            variant="outline"
            className="text-white/50 text-[9px] border-white/10 bg-black/40 h-5"
          >
            {t.duration}
          </Badge>
        </div>

        {/* Visual archetype representation */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 z-10">
          {/* Big emoji + label */}
          <div className="text-5xl mb-1 opacity-90">{vis.emoji}</div>
          <div
            className="text-[10px] font-black tracking-[0.15em] uppercase px-2 py-1 rounded"
            style={{ color: vis.accent, textShadow: `0 0 20px ${vis.accent}80` }}
          >
            {vis.label}
          </div>

          {/* Simulated video bars (content structure visualization) */}
          <div className="w-full mt-2 space-y-1.5 px-2">
            {(t.structure ?? ["Hook", "Body", "CTA"]).map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`h-1.5 rounded-full flex-shrink-0 ${vis.bars[i] ?? "bg-white/20"}`}
                  style={{ width: `${i === 0 ? 30 : i === 1 ? 60 : 45}%` }}
                />
                <span className="text-[8px] text-white/40 truncate">{step}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Example hook quote at bottom */}
        {t.exampleHook && (
          <div className="absolute bottom-0 left-0 right-0 z-20 px-3 pb-3 pt-8 bg-gradient-to-t from-black via-black/80 to-transparent">
            <div
              className="text-[10px] font-semibold leading-snug italic"
              style={{ color: vis.accent }}
            >
              "{t.exampleHook}"
            </div>
          </div>
        )}

        {/* Premium lock overlay */}
        {isPremiumLocked && (
          <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
            <Lock className="h-8 w-8 text-amber-400" />
            <span className="text-amber-400 font-bold text-sm">PRO Required</span>
          </div>
        )}
      </div>

      {/* Card footer */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="font-bold text-white text-sm leading-tight">{t.name}</h3>
            <Badge
              variant="outline"
              className="text-[9px] text-white/40 border-white/10 flex-shrink-0 uppercase tracking-wider"
            >
              {t.platform}
            </Badge>
          </div>
          <p className="text-[11px] text-white/50 leading-relaxed line-clamp-2">{t.description}</p>
        </div>

        <Button
          size="sm"
          onClick={isPremiumLocked ? undefined : onUse}
          disabled={isPremiumLocked}
          className={`w-full h-9 text-xs font-bold gap-1.5 transition-all ${
            isPremiumLocked
              ? "opacity-40 cursor-not-allowed bg-white/5 text-white/30 border border-white/10 hover:bg-white/5"
              : "bg-primary hover:bg-primary/90 shadow-[0_0_15px_rgba(124,58,237,0.25)] hover:shadow-[0_0_25px_rgba(124,58,237,0.4)]"
          }`}
        >
          {isPremiumLocked ? (
            <><Lock className="h-3 w-3" /> Upgrade to Use</>
          ) : (
            <>Use This Template <ArrowRight className="h-3 w-3" /></>
          )}
        </Button>
      </div>
    </div>
  );
}

export default function Templates() {
  const [category, setCategory] = useState("All");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const userPlan = (user as any)?.plan ?? "free";

  const apiCategory = category === "All" ? undefined : category;
  const { data: templates, isLoading } = useListTemplates({ category: apiCategory });

  const handleUseTemplate = (t: Template) => {
    const params = new URLSearchParams({
      templateId: t.id,
      templateName: t.name,
      templateType: t.templateType ?? t.id,
      platform: t.platform.toLowerCase(),
      duration: t.duration,
      templateDesc: t.description,
    });
    setLocation(`/studio?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-[#08080b] flex flex-col">
      {/* Header */}
      <header className="border-b border-white/6 bg-black/40 backdrop-blur-md sticky top-0 z-10">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-white">
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-white text-xs font-black">Q</span>
            </div>
            <span className="text-sm">Template Gallery</span>
          </Link>
          <Link href="/studio">
            <Button variant="outline" size="sm" className="border-white/10 text-white/70 hover:text-white">
              ← Studio
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-6 py-12">
        {/* Hero */}
        <div className="max-w-2xl mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold tracking-wide uppercase mb-5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Proven Formats
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight text-white mb-4 leading-tight">
            Start with a format<br />
            <span className="text-primary">that actually converts.</span>
          </h1>
          <p className="text-lg text-white/50 leading-relaxed">
            Every template is a battle-tested video structure — not a style, a <em>strategy</em>. Pick the format that matches your goal and the AI does the rest.
          </p>
        </div>

        {/* Category filter */}
        <div className="mb-10 overflow-x-auto pb-2 scrollbar-hide">
          <Tabs value={category} onValueChange={setCategory} className="w-max">
            <TabsList className="bg-transparent border border-white/8 p-1 h-auto rounded-full gap-1">
              {CATEGORIES.map(cat => (
                <TabsTrigger
                  key={cat}
                  value={cat}
                  className="rounded-full px-5 py-2 text-xs font-semibold text-white/50 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-[0_0_15px_rgba(124,58,237,0.4)] transition-all"
                >
                  {cat}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-32">
            <Spinner className="h-8 w-8 text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {(templates as Template[] | undefined)?.map(t => (
              <TemplateCard
                key={t.id}
                t={t}
                userPlan={userPlan}
                onUse={() => handleUseTemplate(t)}
              />
            ))}

            {templates?.length === 0 && (
              <div className="col-span-full py-24 text-center">
                <div className="text-4xl mb-4">🎬</div>
                <h3 className="text-xl font-bold text-white mb-2">No templates in this category</h3>
                <p className="text-white/40">Try a different filter above.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
