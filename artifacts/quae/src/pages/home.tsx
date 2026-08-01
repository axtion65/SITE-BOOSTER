import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check, Zap, ShoppingBag, Video, Users, Star, Play, TrendingUp, Clock, DollarSign, Sparkles, ChevronRight, Wand2, Film, ChevronDown } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#050507] text-white flex flex-col">
      <Navbar />
      <main className="flex-1">
        <HeroSection />
        <LogoBar />
        <TemplatesSection />
        <HowItWorksSection />
        <PricingSection />
        <TestimonialsSection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}

function QuaeLogo({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5" style={{ fontSize: size * 0.62 }}>
      <img src="/images/logo-icon.png" alt="Quae.ai" style={{ width: size, height: size, objectFit: "contain" }} />
      <span className="font-black tracking-tight" style={{ letterSpacing: "-0.02em" }}>
        Quae<span className="text-violet-400">.ai</span>
      </span>
    </div>
  );
}

function Navbar() {
  return (
    <header className="fixed top-0 w-full border-b border-white/[0.05] bg-[#050507]/90 backdrop-blur-xl z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <QuaeLogo size={32} />
        <nav className="hidden md:flex items-center gap-8 text-sm">
          <a href="#templates" className="text-white/50 hover:text-white transition-colors outline-none visited:text-white/50">Templates</a>
          <a href="#how" className="text-white/50 hover:text-white transition-colors outline-none visited:text-white/50">How It Works</a>
          <a href="#pricing" className="text-white/50 hover:text-white transition-colors outline-none visited:text-white/50">Pricing</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/signin" className="text-sm text-white/50 hover:text-white transition-colors outline-none visited:text-white/50">Sign In</Link>
          <Link href="/signin" className="h-9 px-5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-bold transition-all shadow-lg shadow-violet-600/20 flex items-center gap-1.5">
            Start Free <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─── Animated Studio Mockup ───────────────────────────────────────────────────

const PRODUCT_PRESETS = [
  {
    product: "HydroGlow Face Serum",
    category: "Skincare · E-Commerce",
    audience: "Women 25–40 interested in anti-aging",
    template: "Shopify Product Ad",
    templateColor: "#4ade80",
    duration: "15s",
    scriptLines: [
      "Your skin is telling you something. Are you listening?",
      "HydroGlow delivers 10× more hydration in just 7 days —",
      "clinically proven, dermatologist-approved.",
      "Tap to claim your starter kit. Free shipping today only.",
    ],
    accent: "from-pink-500/20 to-violet-500/20",
    dot: "#f9a8d4",
  },
  {
    product: "Streamline Pro",
    category: "SaaS · Productivity",
    audience: "Startup founders & remote teams",
    template: "Product Demo",
    templateColor: "#34d399",
    duration: "30s",
    scriptLines: [
      "Your team has 14 open tabs and still misses deadlines.",
      "Streamline Pro collapses your entire workflow into one view —",
      "tasks, docs, and async standups, all in sync.",
      "Trusted by 4,000+ remote teams. Start free today.",
    ],
    accent: "from-emerald-500/20 to-cyan-500/20",
    dot: "#6ee7b7",
  },
  {
    product: "BrewCraft Cold Brew",
    category: "Food & Beverage",
    audience: "Coffee lovers & busy professionals",
    template: "TikTok Viral Hook",
    templateColor: "#69C9D0",
    duration: "15s",
    scriptLines: [
      "I switched to cold brew and my 2pm crash disappeared.",
      "BrewCraft uses 100% single-origin beans, steeped 20 hours.",
      "Smooth, bold, zero bitterness — every single time.",
      "Order your first bag. Use code BREW20 for 20% off.",
    ],
    accent: "from-amber-500/20 to-orange-500/20",
    dot: "#fcd34d",
  },
  {
    product: "Apex Leather Jacket",
    category: "Fashion · Apparel",
    audience: "Fashion-forward men 22–35",
    template: "UGC Review Style",
    templateColor: "#f0f0f0",
    duration: "30s",
    scriptLines: [
      "I've owned this jacket for 6 months. Here's my honest take.",
      "Full-grain leather, Italian hardware, built to last a decade.",
      "It replaced three cheaper jackets I bought in two years.",
      "Ships in 48 hours. Free returns. Link in bio.",
    ],
    accent: "from-slate-500/20 to-zinc-500/20",
    dot: "#cbd5e1",
  },
] as const;

// How long each phase lasts (ms)
const PHASE_DURATION = 5000;
// How many script lines are revealed per preset before cycling
const LINES_PER_PRESET = PRODUCT_PRESETS[0].scriptLines.length;

function AnimatedStudioMockup() {
  const [presetIdx, setPresetIdx] = useState(0);
  const [visibleLines, setVisibleLines] = useState(0);
  const [transitioning, setTransitioning] = useState(false);

  const preset = PRODUCT_PRESETS[presetIdx];

  // Reveal lines one by one, then cycle to next preset
  useEffect(() => {
    setVisibleLines(0);

    let lineTimer: ReturnType<typeof setTimeout>;
    let cycleTimer: ReturnType<typeof setTimeout>;

    // Stagger each line by 900ms
    for (let i = 0; i < LINES_PER_PRESET; i++) {
      lineTimer = setTimeout(() => setVisibleLines(i + 1), 600 + i * 900);
    }

    // After all lines shown, wait then cycle
    cycleTimer = setTimeout(() => {
      setTransitioning(true);
      setTimeout(() => {
        setPresetIdx((p) => (p + 1) % PRODUCT_PRESETS.length);
        setTransitioning(false);
      }, 500);
    }, PHASE_DURATION);

    return () => {
      clearTimeout(lineTimer);
      clearTimeout(cycleTimer);
    };
  }, [presetIdx]);

  return (
    <div className="relative w-full max-w-[420px] mx-auto lg:mx-0 select-none">
      {/* Ambient glow — shifts colour with preset */}
      <motion.div
        key={presetIdx}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className={`absolute -inset-6 bg-gradient-to-br ${preset.accent} rounded-3xl blur-2xl pointer-events-none`}
      />

      {/* Card shell */}
      <div className="relative rounded-2xl border border-white/[0.08] bg-[#0c0c10] shadow-2xl overflow-hidden">

        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
            <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
            <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
          </div>
          <span className="text-[11px] text-white/25 font-medium mx-auto pr-6">Quae Studio</span>
        </div>

        {/* Body */}
        <AnimatePresence mode="wait">
          <motion.div
            key={presetIdx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: transitioning ? 0 : 1, y: transitioning ? -8 : 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.45, ease: "easeInOut" }}
            className="p-5 space-y-4"
          >
            {/* Product name field */}
            <div>
              <label className="text-[10px] text-white/30 uppercase tracking-wider font-semibold mb-1.5 block">Product</label>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: preset.dot }} />
                <span className="text-sm font-bold text-white">{preset.product}</span>
                <span className="ml-auto text-[10px] text-white/25">{preset.category}</span>
              </div>
            </div>

            {/* Audience field */}
            <div>
              <label className="text-[10px] text-white/30 uppercase tracking-wider font-semibold mb-1.5 block">Target Audience</label>
              <div className="px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                <span className="text-xs text-white/60">{preset.audience}</span>
              </div>
            </div>

            {/* Template row */}
            <div className="flex items-center gap-2">
              <Film className="h-3.5 w-3.5 text-white/25 flex-shrink-0" />
              <span className="text-[11px] text-white/35">Template:</span>
              <span
                className="text-[11px] font-bold px-2 py-0.5 rounded-full border"
                style={{ color: preset.templateColor, borderColor: `${preset.templateColor}40`, backgroundColor: `${preset.templateColor}15` }}
              >
                {preset.template}
              </span>
              <span className="ml-auto text-[10px] text-white/25 font-medium">{preset.duration}</span>
            </div>

            {/* Divider */}
            <div className="border-t border-white/[0.06]" />

            {/* AI Script preview */}
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <Wand2 className="h-3 w-3 text-violet-400" />
                <span className="text-[10px] text-violet-400 font-bold uppercase tracking-wider">AI-Generated Script</span>
              </div>
              <div className="space-y-2 min-h-[108px]">
                {preset.scriptLines.map((line, i) => (
                  <AnimatePresence key={`${presetIdx}-${i}`}>
                    {visibleLines > i && (
                      <motion.div
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.35, ease: "easeOut" }}
                        className="flex items-start gap-2"
                      >
                        <span className="text-[10px] text-violet-400/50 font-bold mt-0.5 flex-shrink-0 w-4">{String(i + 1).padStart(2, "0")}</span>
                        <span className="text-[11px] text-white/55 leading-relaxed">{line}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                ))}
              </div>
            </div>

            {/* Progress dots */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex gap-1.5">
                {PRODUCT_PRESETS.map((_, i) => (
                  <div
                    key={i}
                    className="h-1 rounded-full transition-all duration-500"
                    style={{
                      width: i === presetIdx ? 20 : 6,
                      backgroundColor: i === presetIdx ? preset.dot : "rgba(255,255,255,0.12)",
                    }}
                  />
                ))}
              </div>
              <motion.div
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
                className="flex items-center gap-1 text-[10px] text-violet-400/60 font-semibold"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-violet-400/60" />
                Generating…
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function HeroSection() {
  return (
    <section className="pt-32 pb-20 px-6 relative overflow-hidden">
      {/* Multi-layer bg */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_-10%,rgba(124,58,237,0.18),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_30%_at_80%_20%,rgba(139,92,246,0.08),transparent)]" />

      {/* Subtle grid */}
      <div className="absolute inset-0 opacity-[0.025]" style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,0.8) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.8) 1px,transparent 1px)",
        backgroundSize: "60px 60px"
      }} />

      <div className="max-w-6xl mx-auto relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">

          {/* Left: copy */}
          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: "easeOut" }}
            className="flex-1 text-center lg:text-left"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[11px] font-bold mb-8 uppercase tracking-[0.15em]">
              <Sparkles className="h-3 w-3" /> AI Video Ads — Powered by Kling, Veo 3 & Ovi
            </div>
            <h1 className="text-5xl md:text-6xl lg:text-[68px] font-black tracking-tight mb-6 leading-[1.02]">
              Create TikTok Ads,{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-purple-400 to-fuchsia-400">
                Shopify Videos
              </span>{" "}
              &{" "}UGC Content{" "}
              <span className="whitespace-nowrap">in Minutes</span>
            </h1>
            <p className="text-lg md:text-xl text-white/40 mb-10 max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Describe your product. Pick a template. Get a polished, ready-to-post video ad — without a camera, editor, or agency.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
              <Link href="/signin" className="h-14 px-8 bg-violet-600 hover:bg-violet-500 rounded-2xl font-black text-base transition-all shadow-2xl shadow-violet-600/30 hover:shadow-violet-500/40 flex items-center gap-2.5 group">
                Start Free — 3 Videos Included
                <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link href="/templates" className="h-14 px-8 border border-white/10 hover:border-white/20 rounded-2xl font-semibold text-base text-white/60 hover:text-white transition-all flex items-center gap-2">
                View Templates <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-5 flex items-center justify-center lg:justify-start gap-1.5 text-sm text-white/25">
              <Check className="h-3.5 w-3.5 text-violet-400/60" /> No credit card required · Cancel anytime
            </div>

            {/* Platform pills */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-12 flex flex-wrap items-center justify-center lg:justify-start gap-5 text-sm text-white/25"
            >
              {[
                { icon: ShoppingBag, label: "Shopify Ads" },
                { icon: TrendingUp, label: "TikTok Hooks" },
                { icon: Video, label: "UGC Style" },
                { icon: Users, label: "Instagram Reels" },
                { icon: Star, label: "Product Demos" },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <item.icon className="h-3.5 w-3.5 text-violet-400/50" />
                  <span>{item.label}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* Right: animated studio mockup */}
          <motion.div
            initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
            className="w-full lg:w-auto lg:flex-shrink-0 lg:w-[420px]"
          >
            <AnimatedStudioMockup />
          </motion.div>

        </div>
      </div>
    </section>
  );
}

function LogoBar() {
  const brands = ["Shopify", "TikTok", "Amazon", "Instagram", "YouTube", "Meta Ads"];
  return (
    <div className="py-8 border-y border-white/[0.05] bg-white/[0.01]">
      <div className="max-w-4xl mx-auto px-6">
        <p className="text-center text-[11px] uppercase tracking-[0.2em] text-white/20 font-semibold mb-6">Video ads for every platform</p>
        <div className="flex flex-wrap items-center justify-center gap-8">
          {brands.map(b => (
            <span key={b} className="text-white/20 font-black text-sm tracking-tight hover:text-white/40 transition-colors cursor-default">{b}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

const HOME_TEMPLATES = [
  {
    name: "Shopify Product Ad",
    desc: "Drive purchases with a polished product showcase",
    platform: "Instagram · TikTok",
    duration: "15s",
    image: "/images/home-shopify.jpg",
    accent: "#4ade80",
  },
  {
    name: "TikTok Viral Hook",
    desc: "Stop-the-scroll opening that keeps viewers watching",
    platform: "TikTok",
    duration: "15s",
    image: "/images/home-tiktok.jpg",
    accent: "#69C9D0",
  },
  {
    name: "UGC Review Style",
    desc: "Authentic, organic-feeling testimonial video",
    platform: "TikTok · Reels",
    duration: "30s",
    image: "/images/home-ugc.jpg",
    accent: "#f0f0f0",
  },
  {
    name: "Before & After",
    desc: "Show the transformation your product delivers",
    platform: "All platforms",
    duration: "30s",
    image: "/images/home-beforeafter.jpg",
    accent: "#a78bfa",
  },
  {
    name: "Problem / Solution",
    desc: "Agitate the pain, then introduce your fix",
    platform: "YouTube Shorts",
    duration: "30s",
    image: "/images/home-problem.jpg",
    accent: "#f87171",
  },
  {
    name: "Product Demo",
    desc: "Walk through features and benefits clearly",
    platform: "YouTube · Amazon",
    duration: "60s",
    image: "/images/home-demo.jpg",
    accent: "#34d399",
  },
];

function TemplatesSection() {
  return (
    <section id="templates" className="py-28 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-between mb-14">
          <div>
            <p className="text-[11px] font-black tracking-[0.2em] uppercase text-violet-400/70 mb-3">Formats</p>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-tight">Start with a<br />proven template</h2>
          </div>
          <Link href="/templates" className="hidden md:flex items-center gap-1.5 text-sm text-white/40 hover:text-white transition-colors border border-white/10 hover:border-white/20 px-4 py-2 rounded-lg">
            View all 12 <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {HOME_TEMPLATES.map((t, i) => (
            <Link
              key={i}
              href="/signin"
              className="group rounded-2xl border border-white/[0.06] hover:border-white/15 transition-all duration-500 overflow-hidden block bg-[#0c0c0f] hover:shadow-[0_8px_40px_rgba(0,0,0,0.5)] hover:-translate-y-0.5"
            >
              <div className="relative h-52 overflow-hidden">
                <img
                  src={t.image}
                  alt={t.name}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0f] via-[#0c0c0f]/30 to-transparent" />
                <span className="absolute top-3 right-3 text-[10px] text-white/70 bg-black/50 backdrop-blur-sm rounded-full px-2.5 py-1 border border-white/10 font-semibold">
                  {t.duration}
                </span>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                  <div className="h-12 w-12 rounded-full bg-white/10 border border-white/20 backdrop-blur-md flex items-center justify-center shadow-xl">
                    <Play className="h-4 w-4 text-white fill-white ml-0.5" />
                  </div>
                </div>
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h3 className="font-bold text-white text-sm leading-snug group-hover:text-violet-300 transition-colors">{t.name}</h3>
                  <div className="h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: t.accent }} />
                </div>
                <p className="text-xs text-white/35 leading-relaxed mb-3">{t.desc}</p>
                <div className="flex items-center gap-1.5 text-[10px] text-white/25 font-medium uppercase tracking-wide">
                  <span>{t.platform}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-8 text-center md:hidden">
          <Link href="/templates" className="inline-flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300 transition-colors font-semibold">
            View all 12 templates <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    { n: "01", title: "Describe your product", desc: "Name, benefits, audience. 30 seconds to fill out." },
    { n: "02", title: "AI writes the script", desc: "Claude generates a scroll-stopping hook, scenes, and full voiceover." },
    { n: "03", title: "Choose your model", desc: "Ovi for speed. Kling for cinematic. Veo 3 for agency-grade output." },
    { n: "04", title: "Download your video", desc: "Ready-to-post MP4. No editing. No camera. No waiting for a freelancer." },
  ];
  return (
    <section id="how" className="py-28 px-6 border-t border-white/[0.05]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-20">
          <p className="text-[11px] font-black tracking-[0.2em] uppercase text-violet-400/70 mb-3">Process</p>
          <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-4">From idea to video<br />in 4 steps</h2>
          <p className="text-white/35 text-lg">No studio. No editor. No agency retainer.</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s, i) => (
            <div key={i} className="relative group">
              <div className="text-7xl font-black text-white/[0.04] mb-4 leading-none select-none group-hover:text-white/[0.07] transition-colors duration-500">{s.n}</div>
              <div className="w-8 h-[2px] bg-violet-500/50 mb-4 group-hover:w-12 group-hover:bg-violet-400 transition-all duration-500" />
              <h3 className="font-bold text-white mb-2 text-sm">{s.title}</h3>
              <p className="text-xs text-white/35 leading-relaxed">{s.desc}</p>
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-10 -right-3 text-white/[0.08] text-xl select-none">→</div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-16 grid grid-cols-3 gap-4 max-w-md mx-auto">
          {[
            { icon: Clock, label: "Avg render time", value: "~2 min" },
            { icon: DollarSign, label: "vs Agency cost", value: "97% less" },
            { icon: TrendingUp, label: "Platforms", value: "5+" },
          ].map((stat, i) => (
            <div key={i} className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center hover:border-violet-500/20 transition-colors">
              <stat.icon className="h-4 w-4 text-violet-400 mx-auto mb-3 opacity-70" />
              <div className="font-black text-white text-lg">{stat.value}</div>
              <div className="text-[10px] text-white/25 mt-1 uppercase tracking-wide">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const PLANS = [
  {
    name: "Free",
    monthly: 0,
    desc: "Try it out",
    credits: 90,
    videos: "3 videos",
    features: ["3 AI videos (Ovi)", "All 12 templates", "TikTok, Reels, Shorts", "720p export"],
    cta: "Start Free",
    highlight: false,
  },
  {
    name: "Starter",
    monthly: 29,
    annual: 278,
    desc: "Solo creators & small brands",
    credits: 600,
    videos: "~20 Ovi or 3 Wan videos",
    features: ["600 credits/month", "Ovi + Wan 2.5 models", "All platforms", "1080p export", "Priority support"],
    cta: "Get Starter",
    highlight: false,
  },
  {
    name: "Pro",
    monthly: 49,
    annual: 470,
    desc: "Growing brands & teams",
    credits: 2000,
    videos: "~66 Ovi or 6 Kling videos",
    features: ["2,000 credits/month", "All models + Kling 2.5", "All platforms", "4K export", "Priority rendering", "Video history"],
    cta: "Get Pro",
    highlight: true,
  },
  {
    name: "Agency",
    monthly: 149,
    annual: 1430,
    desc: "Agencies & high-volume teams",
    credits: 6000,
    videos: "~200 Ovi or 4 Veo 3 videos",
    features: ["6,000 credits/month", "All models + Veo 3", "All platforms", "4K export", "Fastest rendering", "Team workspace", "API access"],
    cta: "Get Agency",
    highlight: false,
  },
];

function PricingSection() {
  const [annual, setAnnual] = useState(true);
  return (
    <section id="pricing" className="py-28 px-6 border-t border-white/[0.05]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-[11px] font-black tracking-[0.2em] uppercase text-violet-400/70 mb-3">Pricing</p>
          <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-4">Simple, credit-based pricing</h2>
          <p className="text-white/35 text-lg mb-8">Pay for what you use. Credits reset monthly.</p>
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
            <button onClick={() => setAnnual(false)} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${!annual ? "bg-white/10 text-white" : "text-white/30 hover:text-white/50"}`}>
              Monthly
            </button>
            <button onClick={() => setAnnual(true)} className={`px-5 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${annual ? "bg-violet-600 text-white shadow-lg shadow-violet-600/20" : "text-white/30 hover:text-white/50"}`}>
              Annual <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-bold">Save 20%</span>
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((plan, i) => (
            <div key={i} className={`relative rounded-2xl p-6 border transition-all hover:-translate-y-0.5 hover:shadow-xl ${
              plan.highlight
                ? "border-violet-500/60 bg-violet-500/[0.06] shadow-lg shadow-violet-500/10"
                : "border-white/[0.06] bg-white/[0.02] hover:border-white/15"
            }`}>
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-violet-500 text-white text-[10px] font-black rounded-full uppercase tracking-widest whitespace-nowrap shadow-lg shadow-violet-500/30">
                  Most Popular
                </div>
              )}
              <div className="mb-5">
                <h3 className="font-black text-white text-lg mb-0.5">{plan.name}</h3>
                <p className="text-[11px] text-white/30 h-8">{plan.desc}</p>
              </div>
              <div className="mb-1">
                {plan.monthly === 0 ? (
                  <span className="text-4xl font-black text-white">Free</span>
                ) : (
                  <>
                    <span className="text-4xl font-black text-white">
                      ${annual && plan.annual ? Math.round(plan.annual / 12) : plan.monthly}
                    </span>
                    <span className="text-white/30 text-sm">/mo</span>
                  </>
                )}
              </div>
              {annual && plan.annual ? (
                <div className="text-xs text-green-400 mb-5 font-semibold">${plan.annual}/yr — save ${(plan.monthly * 12) - plan.annual}</div>
              ) : (
                <div className="mb-5 h-4" />
              )}
              <div className="p-3 rounded-xl bg-white/[0.04] text-[11px] text-white/50 mb-5 text-center border border-white/[0.06]">
                <span className="text-white font-black">{plan.credits} credits</span>/mo · {plan.videos}
              </div>
              <ul className="space-y-2.5 mb-6">
                {plan.features.map((f, fi) => (
                  <li key={fi} className="flex items-start gap-2 text-xs text-white/40">
                    <Check className="h-3.5 w-3.5 text-violet-400 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/signin"
                className={`w-full flex items-center justify-center h-10 rounded-xl text-sm font-bold transition-all ${
                  plan.highlight
                    ? "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/20"
                    : "bg-white/[0.05] hover:bg-white/10 text-white border border-white/[0.08] hover:border-white/15"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-10 max-w-2xl mx-auto p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
          <h4 className="text-[10px] font-black text-white/30 mb-5 text-center uppercase tracking-[0.2em]">Credit costs per video</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { model: "Ovi", cost: "30", desc: "Video + audio", color: "#818cf8" },
              { model: "Wan 2.5", cost: "200", desc: "Cinematic", color: "#a78bfa" },
              { model: "Kling 2.5", cost: "300", desc: "Ultra-realistic", color: "#c084fc" },
              { model: "Veo 3", cost: "1,500", desc: "Agency grade", color: "#e879f9" },
            ].map((m, i) => (
              <div key={i} className="text-center p-4 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:border-violet-500/20 transition-colors">
                <div className="text-xs font-bold text-white mb-1">{m.model}</div>
                <div className="font-black text-xl mb-0.5" style={{ color: m.color }}>{m.cost}</div>
                <div className="text-[10px] text-white/25 uppercase tracking-wide">{m.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const TESTIMONIALS = [
  {
    name: "Marcus T.",
    role: "Shopify Store Owner",
    text: "I used to spend $800/month on video editors. Now I spend $49 and get better content in minutes. This changed my whole ad strategy.",
    stars: 5,
    metric: "16× cheaper",
  },
  {
    name: "Priya K.",
    role: "TikTok Creator",
    text: "My hook rate went from 18% to 34% after using Quae's scripts. The AI actually understands what stops the scroll.",
    stars: 5,
    metric: "+89% hook rate",
  },
  {
    name: "Derek N.",
    role: "eCommerce Agency",
    text: "We produce 40+ client videos per week with the Agency plan. The Kling model output is indistinguishable from human-shot content.",
    stars: 5,
    metric: "40 videos/week",
  },
];

function TestimonialsSection() {
  return (
    <section className="py-28 px-6 border-t border-white/[0.05]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-[11px] font-black tracking-[0.2em] uppercase text-violet-400/70 mb-3">Social Proof</p>
          <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-3">Brands growing with Quae.ai</h2>
          <p className="text-white/30">Real results from real businesses</p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="p-7 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-violet-500/20 transition-all duration-300 group hover:-translate-y-0.5 hover:shadow-xl hover:shadow-violet-500/5">
              <div className="flex items-center justify-between mb-5">
                <div className="flex gap-0.5">
                  {Array.from({ length: t.stars }).map((_, si) => (
                    <Star key={si} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <span className="text-[11px] font-black text-violet-400 bg-violet-400/10 px-2.5 py-1 rounded-full border border-violet-400/20">
                  {t.metric}
                </span>
              </div>
              <p className="text-sm text-white/50 leading-relaxed mb-6">"{t.text}"</p>
              <div>
                <div className="font-bold text-white text-sm">{t.name}</div>
                <div className="text-[11px] text-white/25 mt-0.5">{t.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaSection() {
  return (
    <section className="py-28 px-6 border-t border-white/[0.05]">
      <div className="max-w-2xl mx-auto text-center">
        <div className="text-5xl md:text-6xl font-black tracking-tight mb-5 leading-tight">
          Ready to cut your<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">video costs by 97%?</span>
        </div>
        <p className="text-white/35 mb-10 text-lg leading-relaxed">Start free. No credit card. 3 videos included.<br />Upgrade when you need more.</p>
        <Link
          href="/signin"
          className="inline-flex items-center gap-2.5 h-14 px-10 bg-violet-600 hover:bg-violet-500 rounded-2xl font-black text-base transition-all shadow-2xl shadow-violet-600/30 hover:shadow-violet-500/40 group"
        >
          Start Creating Free <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
        </Link>
        <div className="mt-5 flex items-center justify-center gap-4 text-xs text-white/20">
          <span className="flex items-center gap-1"><Check className="h-3 w-3 text-violet-400/50" /> No credit card</span>
          <span className="flex items-center gap-1"><Check className="h-3 w-3 text-violet-400/50" /> 3 free videos</span>
          <span className="flex items-center gap-1"><Check className="h-3 w-3 text-violet-400/50" /> Cancel anytime</span>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="py-10 border-t border-white/[0.05] px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <QuaeLogo size={28} />
        <div className="flex gap-8 text-xs text-white/25">
          <a href="#templates" className="hover:text-white transition-colors visited:text-white/25 outline-none">Templates</a>
          <a href="#pricing" className="hover:text-white transition-colors visited:text-white/25 outline-none">Pricing</a>
          <Link href="/signin" className="hover:text-white transition-colors visited:text-white/25">Sign In</Link>
        </div>
        <p className="text-xs text-white/15">© {new Date().getFullYear()} Quae.ai. All rights reserved.</p>
      </div>
    </footer>
  );
}
