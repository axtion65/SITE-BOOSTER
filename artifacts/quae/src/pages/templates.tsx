import { useState } from "react";
import { useListTemplates } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Sparkles, ArrowRight, Lock, Play } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

const CATEGORIES = ["All", "TikTok Ad", "UGC Review", "Before & After", "Shopify Promo", "Amazon Listing", "Trending"];

// Map templateType → downloaded Pexels photo
const TEMPLATE_PHOTOS: Record<string, string> = {
  "tiktok-viral-hook":       "/images/tpl-tiktok.jpg",
  "ugc-review":              "/images/tpl-ugc.jpg",
  "before-after":            "/images/tpl-before-after.jpg",
  "product-demo":            "/images/tpl-demo.jpg",
  "product-unboxing":        "/images/tpl-unboxing.jpg",
  "flash-sale":              "/images/tpl-flash-sale.jpg",
  "amazon-listing":          "/images/tpl-amazon.jpg",
  "brand-story":             "/images/tpl-brand-story.jpg",
  "testimonial-compilation": "/images/tpl-testimonial.jpg",
  "shopify-promo":           "/images/tpl-shopify.jpg",
  "tutorial":                "/images/tpl-tutorial.jpg",
  "instagram-reel":          "/images/tpl-instagram.jpg",
};

// Per-template accent color for the overlay tint & example hook
const TEMPLATE_ACCENT: Record<string, { color: string; label: string }> = {
  "tiktok-viral-hook":       { color: "#69C9D0", label: "VIRAL FORMAT" },
  "ugc-review":              { color: "#f0f0f0", label: "AUTHENTIC" },
  "before-after":            { color: "#a78bfa", label: "TRANSFORMATION" },
  "product-demo":            { color: "#34d399", label: "LIVE DEMO" },
  "product-unboxing":        { color: "#fbbf24", label: "REVEAL" },
  "flash-sale":              { color: "#f87171", label: "URGENCY" },
  "amazon-listing":          { color: "#f59e0b", label: "LISTING VIDEO" },
  "brand-story":             { color: "#c084fc", label: "BRAND FILM" },
  "testimonial-compilation": { color: "#38bdf8", label: "SOCIAL PROOF" },
  "shopify-promo":           { color: "#4ade80", label: "SHOPIFY PROMO" },
  "tutorial":                { color: "#818cf8", label: "STEP-BY-STEP" },
  "instagram-reel":          { color: "#f472b6", label: "AESTHETIC REEL" },
};

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
  const type = t.templateType ?? t.id;
  const photo = TEMPLATE_PHOTOS[type];
  const accent = TEMPLATE_ACCENT[type] ?? { color: "#a78bfa", label: "FORMAT" };
  const isPremiumLocked = t.isPremium && userPlan === "free";

  return (
    <div
      className="group relative flex flex-col rounded-2xl overflow-hidden cursor-pointer border border-white/[0.06] hover:border-white/20 transition-all duration-500 hover:shadow-[0_8px_40px_rgba(0,0,0,0.6)] hover:-translate-y-0.5"
      onClick={isPremiumLocked ? undefined : onUse}
    >
      {/* Portrait photo — full bleed */}
      <div className="relative aspect-[9/16] overflow-hidden bg-[#0c0c0f]">
        {photo ? (
          <img
            src={photo}
            alt={t.name}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-black/80" />
        )}

        {/* Cinematic gradient overlay — always */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

        {/* Top badges */}
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between z-20">
          {t.isPremium ? (
            <Badge className="bg-amber-400/90 text-black text-[9px] font-black tracking-widest border-none shadow-lg backdrop-blur-sm">
              <Sparkles className="h-2.5 w-2.5 mr-1" /> PRO
            </Badge>
          ) : (
            <Badge className="bg-black/50 text-white/50 text-[9px] font-semibold border-white/10 backdrop-blur-sm">
              FREE
            </Badge>
          )}
          <Badge variant="outline" className="bg-black/50 text-white/70 text-[9px] border-white/10 backdrop-blur-sm">
            {t.duration}
          </Badge>
        </div>

        {/* Accent label — mid card */}
        <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 flex justify-center z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div
            className="text-[10px] font-black tracking-[0.2em] uppercase px-3 py-1.5 rounded-full border backdrop-blur-md"
            style={{ color: accent.color, borderColor: `${accent.color}40`, backgroundColor: `${accent.color}15` }}
          >
            {accent.label}
          </div>
        </div>

        {/* Play hover */}
        <div className="absolute inset-0 flex items-center justify-center z-20 opacity-0 group-hover:opacity-100 transition-all duration-300">
          <div className="h-14 w-14 rounded-full bg-white/10 border border-white/20 backdrop-blur-md flex items-center justify-center shadow-2xl transform scale-90 group-hover:scale-100 transition-transform duration-300">
            <Play className="h-5 w-5 text-white fill-white ml-0.5" />
          </div>
        </div>

        {/* Bottom info — always visible */}
        <div className="absolute bottom-0 left-0 right-0 p-4 z-20">
          <h3 className="font-black text-white text-base leading-tight mb-1 tracking-tight">{t.name}</h3>
          {t.exampleHook && (
            <p
              className="text-[11px] italic leading-snug line-clamp-2 font-medium"
              style={{ color: `${accent.color}cc` }}
            >
              "{t.exampleHook}"
            </p>
          )}
        </div>

        {/* Premium lock overlay */}
        {isPremiumLocked && (
          <div className="absolute inset-0 z-30 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
            <div className="h-12 w-12 rounded-full bg-amber-400/10 border border-amber-400/30 flex items-center justify-center">
              <Lock className="h-5 w-5 text-amber-400" />
            </div>
            <div className="text-center">
              <p className="text-amber-400 font-bold text-sm">PRO Required</p>
              <p className="text-white/40 text-[10px] mt-0.5">Upgrade to unlock</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-[#0c0c0f] border-t border-white/[0.06] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant="outline" className="text-[9px] text-white/30 border-white/10 uppercase tracking-wider flex-shrink-0">
            {t.platform}
          </Badge>
          <span className="text-[10px] text-white/30 truncate hidden sm:block">{t.description.slice(0, 40)}…</span>
        </div>
        <Button
          size="sm"
          disabled={isPremiumLocked}
          className="h-7 px-3 text-[11px] font-bold flex-shrink-0 bg-white/8 hover:bg-primary hover:text-white text-white/60 border border-white/10 hover:border-primary transition-all gap-1"
          variant="outline"
        >
          Use <ArrowRight className="h-3 w-3" />
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
    if (t.exampleHook) params.set("exampleHook", t.exampleHook);
    if (t.structure?.length) params.set("structure", JSON.stringify(t.structure));
    setLocation(`/studio?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-[#050507] flex flex-col">
      {/* Header */}
      <header className="border-b border-white/[0.06] bg-[#050507]/90 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/images/logo-icon.png" alt="Quae.ai" className="h-7 w-7 object-contain" />
            <span className="font-black text-white tracking-tight text-lg">Quae<span className="text-violet-400">.ai</span></span>
          </Link>
          <Link href="/studio">
            <Button variant="outline" size="sm" className="border-white/10 text-white/50 hover:text-white hover:border-white/20 text-xs">
              Studio →
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] mx-auto w-full px-8 py-16">
        {/* Hero */}
        <div className="mb-14">
          <p className="text-[11px] font-black tracking-[0.25em] uppercase text-violet-400/70 mb-4">Proven Formats</p>
          <h1 className="text-6xl font-black tracking-tight text-white leading-[1.02] mb-5 max-w-xl">
            Start with a format<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-purple-300">that converts.</span>
          </h1>
          <p className="text-white/40 text-lg max-w-lg leading-relaxed">
            12 battle-tested video structures used by 7-figure brands. Pick your format — the AI writes the script, the video model does the rest.
          </p>
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-2 mb-12">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-4 py-2 rounded-full text-xs font-semibold border transition-all duration-200 ${
                category === cat
                  ? "bg-violet-600 text-white border-violet-600 shadow-[0_0_16px_rgba(124,58,237,0.4)]"
                  : "text-white/40 border-white/8 hover:border-white/20 hover:text-white/70 bg-transparent"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-40">
            <Spinner className="h-8 w-8 text-violet-500" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {(templates as Template[] | undefined)?.map(t => (
              <TemplateCard
                key={t.id}
                t={t}
                userPlan={userPlan}
                onUse={() => handleUseTemplate(t)}
              />
            ))}
            {templates?.length === 0 && (
              <div className="col-span-full py-32 text-center">
                <p className="text-white/20 text-lg">No templates in this category</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
