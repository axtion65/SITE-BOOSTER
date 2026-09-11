import { ArrowRight, CheckCircle2, PlayCircle } from "lucide-react";
import { Link } from "wouter";

const steps = [
  ["01", "Create your Business Profile", "Add your business, website, audience, products, and brand direction once so Quae has the right context."],
  ["02", "Start a Campaign Brief", "Choose a Campaign Template or start from your goal, then set the objective, channel, offer, instructions, and video length."],
  ["03", "Start Strategy", "Quae organizes your approved business context into the audience, offer, hooks, copy, and creative direction for the campaign."],
  ["04", "Review and approve", "Check the strategy, audience, offer, CTA, and copy. Request changes if needed and approve only when the campaign is right."],
  ["05", "Continue to Creative", "Create coordinated product visuals, captions, social content, and video direction from the same approved campaign."],
  ["06", "Build your promotional video", "Choose the video length, review the production details, and start production only when you are ready."],
  ["07", "Review, download, and reuse", "Download completed assets and create more marketing from the same approved campaign instead of starting over."],
] as const;

export default function HowTo() {
  return (
    <div className="min-h-screen bg-[#091322] text-white">
      <header className="border-b border-white/[.08] bg-[#091322]/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3 font-black">
            <img src="/images/logo-icon.png" alt="" className="h-9 w-9 object-contain" />
            <span>Quae<span className="text-violet-400">.ai</span></span>
          </Link>
          <Link href="/signin" className="text-sm font-semibold text-slate-300 hover:text-white">Sign in</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-black uppercase tracking-[.22em] text-violet-300">Customer walkthrough</p>
          <h1 className="mt-4 text-4xl font-black tracking-[-.04em] sm:text-5xl">How to use Quae.ai</h1>
          <p className="mt-5 text-base leading-7 text-slate-300 sm:text-lg">Watch the 48-second walkthrough, then follow the same seven steps whenever you build a campaign.</p>
        </div>

        <section className="mx-auto mt-10 max-w-4xl overflow-hidden rounded-3xl border border-white/[.1] bg-[#111d31] shadow-2xl shadow-slate-950/30">
          <div className="flex items-center gap-3 border-b border-white/[.07] px-5 py-4 text-sm font-semibold text-slate-300">
            <PlayCircle className="h-5 w-5 text-violet-300" />
            Business Profile → Campaign → Approval → Creative → Download
          </div>
          <video
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full bg-black"
            aria-label="How to use Quae.ai customer walkthrough"
          >
            <source src="/videos/quae-how-to.mp4" type="video/mp4" />
            Your browser does not support HTML5 video.
          </video>
          <p className="px-5 py-4 text-center text-xs text-slate-500">The walkthrough is designed to be clear with or without sound.</p>
        </section>

        <ol className="mt-12 grid gap-4 md:grid-cols-2">
          {steps.map(([number, title, copy]) => (
            <li key={number} className="rounded-2xl border border-white/[.08] bg-[#111d31] p-6">
              <div className="flex items-start gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-400/15 text-sm font-black text-violet-200">{number}</span>
                <div>
                  <h2 className="text-lg font-black">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{copy}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-12 rounded-3xl border border-violet-300/20 bg-violet-500/10 p-7 text-center sm:p-9">
          <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-300" />
          <h2 className="mt-4 text-2xl font-black">Ready to build your first campaign?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-300">Your approved business context stays reusable, so you do not need to rebuild the whole campaign every time you create another asset.</p>
          <Link href="/signin?campaignBuilder=1" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-3 font-bold hover:bg-violet-500">Build a campaign <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </main>
    </div>
  );
}
