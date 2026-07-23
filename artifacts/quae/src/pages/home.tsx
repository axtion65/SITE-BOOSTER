import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Film, Zap, Globe2, Sparkles, Video, ArrowRight, Play, LayoutTemplate, Palette, Zap as Lightning } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-1">
        <HeroSection />
        <StatsBar />
        <ProductVideoSection />
        <FeaturesSection />
        <HowItWorksSection />
        <PricingSection />
      </main>
      <Footer />
    </div>
  );
}

function Navbar() {
  return (
    <header className="fixed top-0 w-full border-b border-white/5 bg-background/80 backdrop-blur-md z-50">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-white">
          <div className="h-8 w-8 bg-primary rounded-md flex items-center justify-center">
            <Film className="h-4 w-4 text-white" />
          </div>
          Quae.ai
        </div>
        <div className="flex items-center gap-4">
          <Link href="/signin" className="text-sm font-medium text-muted-foreground hover:text-white transition-colors">
            Sign In
          </Link>
          <Link href="/signin" className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}

function HeroSection() {
  return (
    <section className="pt-32 pb-20 px-6 relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="container mx-auto text-center max-w-4xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium mb-8">
            <Sparkles className="h-4 w-4" />
            V2.0: Now with 4K rendering & Cinematic AI Scripts
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white mb-6 leading-tight">
            Turn Words into <br className="hidden md:block"/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-400">Professional Product Ads</span>
          </h1>
          
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            The AI-powered video studio for e-commerce. Describe your product, and our engines generate polished, cinematic video ads in minutes for Shopify, Amazon, Etsy, TikTok, and Instagram.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signin" className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-base font-medium text-primary-foreground hover:bg-primary/90 transition-colors w-full sm:w-auto">
              Start Creating for Free <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link href="#templates" className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-card px-8 text-base font-medium text-white hover:bg-secondary transition-colors w-full sm:w-auto">
              <Play className="mr-2 h-4 w-4" /> Watch Demo
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function StatsBar() {
  return (
    <div className="border-y border-white/5 bg-secondary/30 backdrop-blur-sm">
      <div className="container mx-auto px-6 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div>
            <div className="text-3xl font-bold text-white mb-1">10M+</div>
            <div className="text-sm font-medium text-muted-foreground">Videos Rendered</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white mb-1">250+</div>
            <div className="text-sm font-medium text-muted-foreground">AI Models & Voices</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white mb-1">4K</div>
            <div className="text-sm font-medium text-muted-foreground">Export Resolution</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white mb-1">120+</div>
            <div className="text-sm font-medium text-muted-foreground">Countries</div>
          </div>
        </div>
        
        <div className="mt-12 pt-8 border-t border-white/5 text-center">
          <p className="text-sm font-medium text-muted-foreground mb-6 uppercase tracking-widest">Trusted by sellers on</p>
          <div className="flex flex-wrap justify-center gap-8 opacity-60 grayscale">
            <div className="text-xl font-bold tracking-tighter">SHOPIFY</div>
            <div className="text-xl font-bold tracking-tighter">AMAZON</div>
            <div className="text-xl font-bold tracking-tighter">ETSY</div>
            <div className="text-xl font-bold tracking-tighter">TIKTOK SHOP</div>
            <div className="text-xl font-bold tracking-tighter">INSTAGRAM</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductVideoSection() {
  return (
    <section className="py-24 px-6">
      <div className="container mx-auto max-w-5xl">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium mb-6">
            <Play className="h-3 w-3 fill-primary" />
            See it in action
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            From product description to polished ad
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Watch how Quae.ai turns a simple product description into a cinematic video ad ready for TikTok, Instagram Reels, or Amazon.
          </p>
        </div>

        {/* Video Player */}
        <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-[0_0_60px_rgba(124,58,237,0.2)] bg-black">
          <video
            autoPlay
            muted
            loop
            playsInline
            className="w-full aspect-video object-cover"
            onError={(e) => {
              const video = e.currentTarget;
              if (!video.dataset.fallback) {
                video.dataset.fallback = "1";
                video.src = "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
                video.load();
              }
            }}
          >
            <source src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4" type="video/mp4" />
            <source src="https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" type="video/mp4" />
          </video>
          {/* Overlay badge */}
          <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-xs font-medium text-white">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            AI Generated · 4K · TikTok 9:16
          </div>
        </div>

        {/* CTA below video */}
        <div className="mt-8 text-center">
          <Link href="/signin" className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-base font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            Create Your First Ad Free <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const features = [
    {
      icon: <Sparkles className="h-6 w-6 text-primary" />,
      title: "Cinematic Script Expansion",
      desc: "Give us a 1-sentence product description. We'll generate a high-converting script with hooks, voiceover, and visual directions."
    },
    {
      icon: <Video className="h-6 w-6 text-primary" />,
      title: "Multiple Rendering Engines",
      desc: "Choose from fast-draft engines to photorealistic 4K cinematic models. Control the exact visual fidelity you need."
    },
    {
      icon: <Globe2 className="h-6 w-6 text-primary" />,
      title: "Platform-Optimized Formats",
      desc: "Instantly export in 9:16 for TikTok/Reels, 16:9 for YouTube, or 1:1 for Facebook ads. Auto-captioned."
    }
  ];

  return (
    <section className="py-24 px-6">
      <div className="container mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">A complete video studio, powered by AI</h2>
          <p className="text-muted-foreground">Everything you need to create thumb-stopping product videos without a camera, crew, or editing skills.</p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((f, i) => (
            <div key={i} className="p-6 rounded-2xl border border-border bg-card hover:border-primary/50 transition-colors">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6">
                {f.icon}
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">{f.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section className="py-24 px-6 bg-secondary/30 border-y border-white/5 relative overflow-hidden">
      <div className="container mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">From idea to ad in 4 steps</h2>
        </div>
        
        <div className="grid md:grid-cols-4 gap-6">
          {[
            { num: "01", title: "Describe", desc: "Paste your product link or enter a short description and target audience." },
            { num: "02", title: "Expand", desc: "Our AI generates a cinematic script with a scroll-stopping hook." },
            { num: "03", title: "Customize", desc: "Pick a voice, select a visual style, and tweak the scenes." },
            { num: "04", title: "Render & Publish", desc: "Export in 4K directly to your preferred aspect ratio." }
          ].map((step, i) => (
            <div key={i} className="relative">
              <div className="text-5xl font-black text-white/5 mb-4">{step.num}</div>
              <h3 className="text-lg font-bold text-white mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  const tiers = [
    {
      name: "Free",
      price: "$0",
      desc: "Perfect for testing the waters",
      credits: "300 credits/mo",
      features: ["5 videos per month", "720p resolution", "Standard rendering speed", "Watermarked export"],
      btnText: "Get Started",
      popular: false
    },
    {
      name: "Creator",
      price: "$29",
      desc: "For serious content creators",
      credits: "3000 credits/mo",
      features: ["Unlimited videos", "4K resolution", "Fast rendering speed", "No watermark", "Commercial license"],
      btnText: "Start Free Trial",
      popular: true
    },
    {
      name: "Agency",
      price: "$99",
      desc: "For teams and marketing agencies",
      credits: "15000 credits/mo",
      features: ["Unlimited videos", "4K resolution", "Priority rendering speed", "Custom branding", "Team workspace"],
      btnText: "Contact Sales",
      popular: false
    }
  ];

  return (
    <section className="py-24 px-6 relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background pointer-events-none" />
      <div className="container mx-auto relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Simple, transparent pricing</h2>
          <p className="text-muted-foreground">Start for free. Upgrade when you need more power.</p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {tiers.map((t, i) => (
            <div key={i} className={`rounded-2xl p-8 border ${t.popular ? 'border-primary bg-card/80 shadow-[0_0_30px_rgba(124,58,237,0.15)] relative' : 'border-border bg-card'}`}>
              {t.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-white text-xs font-bold rounded-full uppercase tracking-wider">
                  Most Popular
                </div>
              )}
              <h3 className="text-xl font-bold text-white mb-2">{t.name}</h3>
              <p className="text-sm text-muted-foreground mb-6 h-10">{t.desc}</p>
              <div className="mb-6">
                <span className="text-4xl font-extrabold text-white">{t.price}</span>
                <span className="text-muted-foreground">/mo</span>
              </div>
              <div className="px-4 py-2 rounded-lg bg-secondary/50 text-sm font-medium text-white mb-6 text-center border border-white/5">
                {t.credits}
              </div>
              <ul className="space-y-3 mb-8">
                {t.features.map((f, fi) => (
                  <li key={fi} className="flex items-center text-sm text-muted-foreground">
                    <CheckIcon className="h-4 w-4 text-primary mr-3 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/signin" className={`w-full flex items-center justify-center h-10 rounded-md text-sm font-medium transition-colors ${t.popular ? 'bg-primary text-white hover:bg-primary/90' : 'bg-secondary text-white hover:bg-secondary/80'}`}>
                {t.btnText}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="py-12 border-t border-white/5 bg-background text-center text-muted-foreground">
      <div className="flex items-center justify-center gap-2 font-bold text-lg text-white mb-4">
        <Film className="h-5 w-5 text-primary" /> Quae.ai
      </div>
      <p className="text-sm">© {new Date().getFullYear()} Quae.ai. All rights reserved.</p>
    </footer>
  );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
