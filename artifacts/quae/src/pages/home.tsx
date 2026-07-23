import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Film, Zap, Globe2, Sparkles, Video, ArrowRight, Play, LayoutTemplate, Palette, Zap as Lightning, X, Rocket } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
            <a href="#demo" className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-card px-8 text-base font-medium text-white hover:bg-secondary transition-colors w-full sm:w-auto">
              <Play className="mr-2 h-4 w-4" /> Watch Demo
            </a>
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

const PROMPT_TEXT = `"Luxury wireless headphones — deep bass, 40hr battery, matte black. Make it feel premium and cinematic for TikTok."`;

function PromptTypewriter() {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const idx = useRef(0);

  useEffect(() => {
    if (done) return;
    const interval = setInterval(() => {
      idx.current += 1;
      setDisplayed(PROMPT_TEXT.slice(0, idx.current));
      if (idx.current >= PROMPT_TEXT.length) {
        setDone(true);
        clearInterval(interval);
      }
    }, 28);
    return () => clearInterval(interval);
  }, [done]);

  return (
    <div className="rounded-xl border border-white/10 bg-black/60 backdrop-blur-sm p-4 mb-3 text-left">
      <div className="flex items-center gap-2 mb-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-500/80" />
        <span className="ml-2 text-xs text-muted-foreground font-mono">quae.ai — new project</span>
      </div>
      <p className="text-sm text-muted-foreground font-mono mb-1">Product description:</p>
      <p className="text-sm text-white font-mono leading-relaxed min-h-[3.5rem]">
        {displayed}
        {!done && <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse align-middle" />}
      </p>
      {done && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 flex items-center gap-2"
        >
          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-primary to-purple-400 rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 3, ease: "linear" }}
            />
          </div>
          <span className="text-xs text-primary font-medium whitespace-nowrap">Generating ad…</span>
        </motion.div>
      )}
    </div>
  );
}

function ProductVideoSection() {
  const [showOverlay, setShowOverlay] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [, setLocation] = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);

  const handlePlay = () => {
    setPlaying(true);
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.play().catch(() => {});
      }
    }, 50);
  };

  return (
    <section id="demo" className="py-24 px-6 relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/8 to-transparent pointer-events-none" />

      <div className="container mx-auto max-w-5xl relative">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium mb-6">
            <Zap className="h-3 w-3 fill-primary" />
            Watch it generate live
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-4">
            One sentence.{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-400">
              A cinematic ad.
            </span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Type a product description — Quae.ai writes the script, picks the shots, and renders a polished video ad ready to post.
          </p>
        </motion.div>

        {/* Typewriter prompt */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
        >
          <PromptTypewriter />
        </motion.div>

        {/* Video Player */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="relative rounded-2xl overflow-hidden border border-purple-500/30 shadow-[0_0_100px_rgba(124,58,237,0.4)] bg-black aspect-video"
        >
          {/* Actual video — hidden until user clicks play */}
          <video
            ref={videoRef}
            muted
            playsInline
            preload="none"
            className={`w-full h-full object-cover absolute inset-0 transition-opacity duration-500 ${playing ? "opacity-100" : "opacity-0"}`}
            onEnded={() => setShowOverlay(true)}
          >
            <source src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4" type="video/mp4" />
            <source src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4" type="video/mp4" />
          </video>

          {/* Poster / play screen — shown before user clicks */}
          <AnimatePresence>
            {!playing && (
              <motion.div
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer group"
                onClick={handlePlay}
              >
                {/* Cinematic dark gradient background */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#0d0014] via-[#1a0033] to-[#0a001a]" />
                {/* Animated purple orbs */}
                <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/20 rounded-full blur-[80px] animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-purple-500/15 rounded-full blur-[60px] animate-pulse" style={{ animationDelay: "1s" }} />

                {/* Product ad preview text */}
                <div className="relative z-10 text-center px-8">
                  <div className="text-xs text-muted-foreground font-mono mb-6 tracking-widest uppercase">
                    AI-Generated Product Ad · TikTok 9:16
                  </div>
                  {/* Big play button */}
                  <button className="h-20 w-20 rounded-full bg-white/10 border-2 border-white/30 flex items-center justify-center mx-auto mb-6 group-hover:bg-primary/60 group-hover:border-primary transition-all duration-300 group-hover:scale-110">
                    <Play className="h-8 w-8 text-white fill-white ml-1" />
                  </button>
                  <p className="text-white font-semibold text-lg">Click to watch the demo</p>
                  <p className="text-muted-foreground text-sm mt-1">See a full product ad generated by Quae.ai</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Badges — shown while playing */}
          {playing && (
            <>
              <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-sm border border-white/10 text-xs font-medium text-white z-10">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                AI Generated · 4K · TikTok Ready
              </div>
              <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-primary/80 backdrop-blur-sm text-xs font-bold text-white z-10">
                ⚡ Generated in 47s
              </div>
            </>
          )}

          {/* Signup overlay — fires when video ends */}
          <AnimatePresence>
            {showOverlay && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center text-center px-8 z-20"
              >
                <button
                  onClick={() => setShowOverlay(false)}
                  className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <div className="h-16 w-16 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center mx-auto mb-6">
                    <Rocket className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-3xl font-extrabold text-white mb-3">Ready to create yours?</h3>
                  <p className="text-muted-foreground mb-8 max-w-sm mx-auto text-base">
                    Join thousands of sellers generating professional video ads in under 60 seconds — no camera, no crew, no editing skills.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button
                      size="lg"
                      className="text-base px-8 bg-primary hover:bg-primary/90 shadow-[0_0_30px_rgba(124,58,237,0.5)]"
                      onClick={() => setLocation("/signin")}
                    >
                      Start Free — No Credit Card <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="text-base px-8"
                      onClick={() => {
                        setShowOverlay(false);
                        setPlaying(false);
                        if (videoRef.current) {
                          videoRef.current.currentTime = 0;
                        }
                      }}
                    >
                      <Play className="mr-2 h-4 w-4" /> Watch Again
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-6">300 free credits on signup · No credit card required</p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Persistent CTA strip below video */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link
            href="/signin"
            className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-base font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-[0_0_24px_rgba(124,58,237,0.4)] w-full sm:w-auto"
          >
            Create Your First Ad Free <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
          <p className="text-sm text-muted-foreground">No credit card · 300 free credits</p>
        </motion.div>
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
