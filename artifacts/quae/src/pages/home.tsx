import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Check, Zap, ShoppingBag, Video, Users, Star, Play, TrendingUp, Clock, DollarSign } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      <Navbar />
      <main className="flex-1">
        <HeroSection />
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
    <div className="flex items-center gap-2 font-black tracking-tight" style={{ fontSize: size * 0.65 }}>
      <img
        src="/images/logo-icon.png"
        alt="Quae.ai logo"
        style={{ width: size, height: size, objectFit: "contain" }}
      />
      <span style={{ letterSpacing: "-0.02em" }}>
        Quae<span className="text-violet-400">.ai</span>
      </span>
    </div>
  );
}

function Navbar() {
  return (
    <header className="fixed top-0 w-full border-b border-white/5 bg-[#0a0a0f]/90 backdrop-blur-md z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <QuaeLogo size={34} />
        <nav className="hidden md:flex items-center gap-8 text-sm">
          {/* visited: and active: overrides prevent browser default dark-link state */}
          <a href="#templates" className="text-white/60 hover:text-white active:text-white/60 visited:text-white/60 transition-colors outline-none">Templates</a>
          <a href="#how" className="text-white/60 hover:text-white active:text-white/60 visited:text-white/60 transition-colors outline-none">How It Works</a>
          <a href="#pricing" className="text-white/60 hover:text-white active:text-white/60 visited:text-white/60 transition-colors outline-none">Pricing</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/signin" className="text-sm text-white/60 hover:text-white active:text-white/60 visited:text-white/60 transition-colors outline-none">Sign In</Link>
          <Link href="/signin" className="h-9 px-4 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5">
            Start Free <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

function HeroSection() {
  return (
    <section className="pt-32 pb-24 px-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(124,58,237,0.15),transparent)]" />
      <div className="max-w-5xl mx-auto text-center relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium mb-8 uppercase tracking-wider">
            <Zap className="h-3 w-3" /> AI Video Ads for Businesses
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 leading-[1.05]">
            Create TikTok Ads,{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-purple-300">
              Shopify Videos
            </span>{" "}
            & UGC Content in Minutes
          </h1>
          <p className="text-lg md:text-xl text-white/50 mb-10 max-w-2xl mx-auto leading-relaxed">
            Describe your product. Pick a template. Get a polished, ready-to-post video ad — without a camera, editor, or agency.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signin" className="h-13 px-8 py-3.5 bg-violet-600 hover:bg-violet-500 rounded-xl font-bold text-base transition-all shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 flex items-center gap-2">
              Start Free — 3 Videos Included <ArrowRight className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-2 text-sm text-white/40">
              <Check className="h-4 w-4 text-violet-400" /> No credit card required
            </div>
          </div>
        </motion.div>

        <div className="mt-16 flex flex-wrap items-center justify-center gap-8 text-sm text-white/30">
          {[
            { icon: ShoppingBag, label: "Shopify Ads" },
            { icon: TrendingUp, label: "TikTok Hooks" },
            { icon: Video, label: "UGC Style" },
            { icon: Users, label: "Instagram Reels" },
            { icon: Star, label: "Product Demos" },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <item.icon className="h-4 w-4 text-violet-400/60" />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const TEMPLATES = [
  {
    name: "Shopify Product Ad",
    desc: "Drive purchases with a polished product showcase",
    platform: "Instagram / TikTok",
    duration: "15s",
    image: "/images/template-shopify.jpg",
  },
  {
    name: "TikTok Viral Hook",
    desc: "Stop-the-scroll opening that keeps viewers watching",
    platform: "TikTok",
    duration: "15s",
    image: "/images/template-tiktok.jpg",
  },
  {
    name: "UGC Review Style",
    desc: "Authentic, organic-feeling testimonial video",
    platform: "TikTok / Reels",
    duration: "30s",
    image: "/images/template-ugc.jpg",
  },
  {
    name: "Before & After",
    desc: "Show the transformation your product delivers",
    platform: "All platforms",
    duration: "30s",
    image: "/images/template-beforeafter.jpg",
  },
  {
    name: "Problem / Solution",
    desc: "Agitate the pain, then introduce your fix",
    platform: "YouTube Shorts",
    duration: "30s",
    image: "/images/template-problem.jpg",
  },
  {
    name: "Product Demo",
    desc: "Walk through features and benefits clearly",
    platform: "YouTube / Amazon",
    duration: "60s",
    image: "/images/template-demo.jpg",
  },
];

function TemplatesSection() {
  return (
    <section id="templates" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Start with a template</h2>
          <p className="text-white/50 text-lg">Pre-built for the content types that actually convert</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {TEMPLATES.map((t, i) => (
            <Link key={i} href="/signin" className="group rounded-2xl border border-white/5 bg-white/[0.02] hover:border-violet-500/30 transition-all cursor-pointer overflow-hidden block">
              {/* Image thumbnail */}
              <div className="relative h-44 overflow-hidden">
                <img
                  src={t.image}
                  alt={t.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/20 to-transparent" />
                {/* Duration badge */}
                <span className="absolute top-3 right-3 text-xs text-white/80 bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5 border border-white/10">
                  {t.duration}
                </span>
                {/* Play button */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="h-12 w-12 rounded-full bg-violet-600/90 backdrop-blur-sm flex items-center justify-center shadow-lg shadow-violet-500/30">
                    <Play className="h-5 w-5 text-white fill-white ml-0.5" />
                  </div>
                </div>
              </div>
              {/* Card content */}
              <div className="p-5">
                <h3 className="font-semibold text-white mb-1.5 group-hover:text-violet-300 transition-colors">{t.name}</h3>
                <p className="text-sm text-white/40 mb-3 leading-relaxed">{t.desc}</p>
                <div className="flex items-center gap-1.5 text-xs text-violet-400/70">
                  <Play className="h-3 w-3" /> {t.platform}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    { n: "01", title: "Describe your product", desc: "Enter your product name, what it does, and who it's for. 30 seconds." },
    { n: "02", title: "AI writes the script", desc: "Claude generates a scroll-stopping hook, scenes, and voiceover in seconds." },
    { n: "03", title: "Choose your style", desc: "Pick your AI video model, platform format, and duration." },
    { n: "04", title: "Get your video", desc: "Download a ready-to-post video ad. No editing. No camera. Done." },
  ];
  return (
    <section id="how" className="py-24 px-6 border-t border-white/5">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">From idea to video in 4 steps</h2>
          <p className="text-white/50 text-lg">No studio. No editor. No waiting.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s, i) => (
            <div key={i} className="relative">
              <div className="text-5xl font-black text-white/5 mb-3">{s.n}</div>
              <h3 className="font-bold text-white mb-2">{s.title}</h3>
              <p className="text-sm text-white/40 leading-relaxed">{s.desc}</p>
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-8 -right-3 text-white/10 text-lg">→</div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-12 grid grid-cols-3 gap-6 max-w-lg mx-auto text-center">
          {[
            { icon: Clock, label: "Avg render time", value: "~60 sec" },
            { icon: DollarSign, label: "Cost vs agency", value: "95% less" },
            { icon: TrendingUp, label: "Platforms", value: "5+" },
          ].map((stat, i) => (
            <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
              <stat.icon className="h-5 w-5 text-violet-400 mx-auto mb-2" />
              <div className="font-bold text-white">{stat.value}</div>
              <div className="text-xs text-white/30 mt-0.5">{stat.label}</div>
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
    features: ["3 AI videos (Ovi)", "All 6 templates", "TikTok, Reels, Shorts", "720p export"],
    cta: "Start Free",
    highlight: false,
  },
  {
    name: "Starter",
    monthly: 29,
    annual: 278,
    desc: "For solo creators & small brands",
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
    desc: "For growing brands & teams",
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
    desc: "For agencies & high-volume creators",
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
    <section id="pricing" className="py-24 px-6 border-t border-white/5">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple, credit-based pricing</h2>
          <p className="text-white/50 text-lg mb-8">Pay for what you use. Credits reset monthly.</p>
          <div className="inline-flex items-center gap-3 p-1 rounded-xl bg-white/5 border border-white/10">
            <button onClick={() => setAnnual(false)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${!annual ? "bg-white/10 text-white" : "text-white/40"}`}>
              Monthly
            </button>
            <button onClick={() => setAnnual(true)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${annual ? "bg-violet-600 text-white" : "text-white/40"}`}>
              Annual <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">🔥 Save 20%</span>
            </button>
          </div>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((plan, i) => (
            <div key={i} className={`relative rounded-2xl p-6 border transition-all ${plan.highlight ? "border-violet-500 bg-violet-500/5 shadow-lg shadow-violet-500/10" : "border-white/5 bg-white/[0.02]"}`}>
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-violet-500 text-white text-xs font-bold rounded-full uppercase tracking-wider whitespace-nowrap">
                  Most Popular
                </div>
              )}
              <h3 className="font-bold text-white mb-1">{plan.name}</h3>
              <p className="text-xs text-white/40 mb-4 h-8">{plan.desc}</p>
              <div className="mb-1">
                {plan.monthly === 0 ? (
                  <span className="text-3xl font-black text-white">Free</span>
                ) : (
                  <>
                    <span className="text-3xl font-black text-white">
                      ${annual && plan.annual ? Math.round(plan.annual / 12) : plan.monthly}
                    </span>
                    <span className="text-white/40 text-sm">/mo</span>
                  </>
                )}
              </div>
              {annual && plan.annual && (
                <div className="text-xs text-green-400 mb-4">${plan.annual}/yr — save 20%</div>
              )}
              {(!annual || !plan.annual) && <div className="mb-4 h-4" />}
              <div className="p-3 rounded-lg bg-white/5 text-xs text-white/60 mb-5 text-center">
                <span className="text-white font-semibold">{plan.credits} credits</span>/mo · {plan.videos}
              </div>
              <ul className="space-y-2.5 mb-6">
                {plan.features.map((f, fi) => (
                  <li key={fi} className="flex items-start gap-2 text-xs text-white/50">
                    <Check className="h-3.5 w-3.5 text-violet-400 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/signin" className={`w-full flex items-center justify-center h-10 rounded-xl text-sm font-semibold transition-all ${plan.highlight ? "bg-violet-600 hover:bg-violet-500 text-white" : "bg-white/5 hover:bg-white/10 text-white"}`}>
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
        <div className="mt-10 max-w-2xl mx-auto p-6 rounded-2xl bg-white/[0.02] border border-white/5">
          <h4 className="text-sm font-semibold text-white/70 mb-4 text-center uppercase tracking-wider">Credit costs per video</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { model: "Ovi", cost: "30", desc: "Video + audio" },
              { model: "Wan 2.5", cost: "200", desc: "Cinematic" },
              { model: "Kling 2.5", cost: "300", desc: "Ultra-realistic" },
              { model: "Veo 3", cost: "1,500", desc: "Agency grade" },
            ].map((m, i) => (
              <div key={i} className="text-center p-3 rounded-lg bg-white/5">
                <div className="text-sm font-bold text-white">{m.model}</div>
                <div className="text-violet-400 font-black text-lg">{m.cost}</div>
                <div className="text-xs text-white/30">credits · {m.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const TESTIMONIALS = [
  { name: "Marcus T.", role: "Shopify Store Owner", text: "I used to spend $800/month on video editors. Now I spend $49 and get better content in minutes. This changed my whole ad strategy.", stars: 5 },
  { name: "Priya K.", role: "TikTok Creator", text: "My hook rate went from 18% to 34% after using Quae's scripts. The AI actually understands what stops the scroll.", stars: 5 },
  { name: "Derek N.", role: "eCommerce Agency", text: "We produce 40+ client videos per week with the Agency plan. The Kling model output is indistinguishable from human-shot content.", stars: 5 },
];

function TestimonialsSection() {
  return (
    <section className="py-24 px-6 border-t border-white/5">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3">Brands growing with Quae.ai</h2>
          <p className="text-white/40">Real results from real businesses</p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: t.stars }).map((_, si) => (
                  <Star key={si} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <p className="text-sm text-white/60 leading-relaxed mb-5">"{t.text}"</p>
              <div>
                <div className="font-semibold text-white text-sm">{t.name}</div>
                <div className="text-xs text-white/30">{t.role}</div>
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
    <section className="py-24 px-6 border-t border-white/5">
      <div className="max-w-2xl mx-auto text-center">
        <div className="text-4xl font-black mb-4">Ready to cut your video costs?</div>
        <p className="text-white/50 mb-8 text-lg">Start free. No credit card. 3 videos included. Upgrade when you need more.</p>
        <Link href="/signin" className="inline-flex items-center gap-2 h-13 px-8 py-3.5 bg-violet-600 hover:bg-violet-500 rounded-xl font-bold text-base transition-all shadow-lg shadow-violet-500/25">
          Start Creating Free <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="py-10 border-t border-white/5 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <QuaeLogo size={28} />
        <div className="flex gap-6 text-sm text-white/30">
          <a href="#templates" className="hover:text-white transition-colors visited:text-white/30 active:text-white/30 outline-none">Templates</a>
          <a href="#pricing" className="hover:text-white transition-colors visited:text-white/30 active:text-white/30 outline-none">Pricing</a>
          <Link href="/signin" className="hover:text-white transition-colors">Sign In</Link>
        </div>
        <p className="text-xs text-white/20">© {new Date().getFullYear()} Quae.ai. All rights reserved.</p>
      </div>
    </footer>
  );
}
