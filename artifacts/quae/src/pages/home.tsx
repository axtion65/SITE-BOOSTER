import { useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight, BadgeCheck, BookOpenCheck, BrainCircuit, Check, CheckCircle2,
  ClipboardCheck, FileText, Image, Lightbulb, Megaphone, MessageSquareText,
  PenLine, PlaySquare, Search, ShieldCheck, Sparkles, Target, WandSparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { PLAN_CATALOG, formatUsd } from "@workspace/plans";

export const HERO_HEADLINE = "Grow Your Business With an Entire AI Marketing Team";
export const SIGNED_OUT_CAMPAIGN_ROUTE = "/signin";
export const SIGNED_IN_CAMPAIGN_ROUTE = "/studio/campaigns";

const outputs = [
  [Target, "Campaign strategy", "A focused plan built around your business, audience, and goal."],
  [PenLine, "Marketing copy", "Campaign messages, offers, headlines, and calls to action."],
  [Image, "Product visuals", "On-brand creative directions and polished product imagery."],
  [PlaySquare, "Promotional videos", "Video concepts, scripts, scenes, and production direction."],
  [MessageSquareText, "Social content", "Channel-ready posts, captions, hooks, and content ideas."],
  [FileText, "Print-ready marketing", "Coordinated messaging and creative for physical campaigns."],
] as const;

const team = [
  [Lightbulb, "Strategist", "Shapes the campaign around your goal."],
  [Search, "Research", "Finds useful business and audience context."],
  [Megaphone, "Hooks", "Develops clear attention-getting angles."],
  [PenLine, "Writers", "Creates coordinated campaign copy."],
  [ClipboardCheck, "Judge", "Challenges each idea against the brief."],
  [WandSparkles, "Rewriter", "Improves clarity, voice, and persuasion."],
  [ShieldCheck, "Fact Check", "Flags claims that need confirmation."],
  [BadgeCheck, "Quality Review", "Checks consistency before your review."],
] as const;

const publicPlanBenefits = {
  free: ["Complete campaigns", "Product visuals", "Social + marketing copy"],
  starter: ["Complete campaigns", "More creative production", "Higher monthly capacity"],
  pro: ["Higher monthly capacity", "Priority production", "Campaign history + premium exports"],
  agency: ["More creative production", "Priority production", "Team workflow access"],
} as const satisfies Record<(typeof PLAN_CATALOG)[number]["slug"], readonly [string, string, string]>;

const campaignTemplates = [
  ["Product Launch", "Introduce a product with a clear story, launch message, creative direction, and channel plan."],
  ["Seasonal Sale", "Coordinate a timely offer across social, video, product visuals, and print touchpoints."],
  ["Local Business Promotion", "Turn a local goal into relevant messaging, creative, and recommended community channels."],
  ["Social Media Growth", "Build a repeatable social campaign with content themes, hooks, captions, and video direction."],
  ["New Customer Offer", "Package an introductory offer with persuasive copy, creative concepts, and follow-up content."],
  ["Print + Social Campaign", "Keep physical and digital marketing aligned with one strategy and consistent message."],
  ["E-commerce Product Campaign", "Create a product-led campaign for storefront, social, email, and promotional video."],
] as const;

function Logo() {
  return <span className="flex items-center gap-3 text-white">
    <img src="/images/logo-icon.png" alt="" className="h-10 w-10 object-contain" />
    <span><span className="block text-xl font-extrabold leading-none">Quae<span className="text-violet-400">.ai</span></span><span className="mt-1 block text-[9px] font-bold uppercase tracking-[.2em] text-slate-400">AI Marketing Dept.</span></span>
  </span>;
}

function SectionIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy?: string }) {
  return <div className="mx-auto max-w-3xl text-center">
    <p className="text-xs font-bold uppercase tracking-[.24em] text-violet-300">{eyebrow}</p>
    <h2 className="mt-4 text-3xl font-bold tracking-[-.035em] text-white sm:text-4xl lg:text-5xl">{title}</h2>
    {copy && <p className="mt-5 text-base leading-7 text-slate-300 sm:text-lg">{copy}</p>}
  </div>;
}

export default function Home() {
  const { token } = useAuth();
  const campaignRoute = token ? SIGNED_IN_CAMPAIGN_ROUTE : SIGNED_OUT_CAMPAIGN_ROUTE;
  return <div className="min-h-screen overflow-x-hidden bg-[#091322] text-white selection:bg-violet-400/30">
    <header className="sticky top-0 z-50 border-b border-white/[.08] bg-[#091322]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 sm:px-7 lg:px-10">
        <Link href="/" aria-label="Quae.ai home"><Logo /></Link>
        <nav aria-label="Homepage navigation" className="hidden items-center gap-7 text-sm font-semibold text-slate-300 md:flex">
          <a href="#department" className="hover:text-white">What Quae creates</a><a href="#how" className="hover:text-white">How it works</a><a href="#campaign-templates" className="hover:text-white">Campaign Templates</a><a href="#pricing" className="hover:text-white">Pricing</a>
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href={token ? "/studio/dashboard" : "/signin"} className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 hover:text-white sm:block">{token ? "Open workspace" : "Sign in"}</Link>
          <Link href={campaignRoute} className="rounded-xl bg-violet-600 px-3.5 py-2.5 text-sm font-bold shadow-lg shadow-violet-950/40 transition-colors hover:bg-violet-500 sm:px-5">Build a campaign</Link>
        </div>
      </div>
    </header>

    <main>
      <section className="relative isolate border-b border-white/[.06]">
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_20%,rgba(124,58,237,.22),transparent_35rem),radial-gradient(circle_at_90%_45%,rgba(91,124,250,.13),transparent_30rem)]" />
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-20 sm:px-7 sm:py-28 lg:grid-cols-[1.02fr_.98fr] lg:px-10 lg:py-32">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-400/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[.18em] text-violet-200"><Sparkles className="h-3.5 w-3.5" />Your AI Marketing Department</p>
            <h1 className="mt-7 max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-[-.05em] sm:text-6xl lg:text-7xl">{HERO_HEADLINE}</h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">Quae learns your business, builds your campaign, and creates the strategy, copy, product visuals, videos, social content, and print-ready marketing you need.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href={campaignRoute} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3 font-bold shadow-xl shadow-violet-950/40 hover:bg-violet-500">Build My First Campaign <ArrowRight className="h-4 w-4" /></Link>
              <a href="#how" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/15 bg-white/[.05] px-6 py-3 font-bold hover:bg-white/[.09]">See How Quae Works</a>
            </div>
            <p className="mt-5 flex items-center gap-2 text-sm text-slate-400"><CheckCircle2 className="h-4 w-4 text-emerald-300" />You stay in control and approve the campaign before final assets.</p>
          </div>
          <WorkflowVisual />
        </div>
      </section>

      <section id="department" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-20 sm:px-7 lg:px-10 lg:py-28">
        <SectionIntro eyebrow="One coordinated department" title="Everything Your Marketing Department Creates" copy="Strategy and production work together, so every deliverable supports the same campaign rather than becoming another disconnected asset." />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{outputs.map(([Icon,title,copy]) => <article key={title} className="rounded-2xl border border-white/[.08] bg-[#111d31] p-6 shadow-xl shadow-slate-950/15"><Icon className="h-6 w-6 text-violet-300" /><h3 className="mt-5 text-lg font-bold">{title}</h3><p className="mt-2 leading-6 text-slate-400">{copy}</p></article>)}</div>
      </section>

      <section className="border-y border-white/[.06] bg-[#0d192b] py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-7 lg:px-10"><SectionIntro eyebrow="Specialists working together" title="Your AI Marketing Team" copy="Quae organizes distinct marketing roles into one reviewable workflow. Each role strengthens the campaign before it reaches you." />
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{team.map(([Icon,title,copy]) => <article key={title} className="rounded-2xl border border-white/[.07] bg-white/[.035] p-5"><Icon className="h-5 w-5 text-violet-300" /><h3 className="mt-4 font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{copy}</p></article>)}</div>
        </div>
      </section>

      <HowSection />
      <ApprovalSection />

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-7 lg:grid-cols-2 lg:px-10 lg:py-28">
        <div><p className="text-xs font-bold uppercase tracking-[.24em] text-violet-300">Built around your brand</p><h2 className="mt-4 text-4xl font-bold tracking-[-.04em] sm:text-5xl">Quae already knows your business.</h2><p className="mt-6 text-lg leading-8 text-slate-300">Your approved business profile, products, audience, voice, and brand direction give each new campaign a consistent starting point. You can review the work, refine the brief, and keep every asset aligned.</p></div>
        <div className="rounded-3xl border border-violet-300/15 bg-gradient-to-br from-violet-500/15 to-[#172641] p-7 sm:p-9"><BookOpenCheck className="h-8 w-8 text-violet-300" /><h3 className="mt-6 text-xl font-bold">One business context. Every campaign.</h3><ul className="mt-6 space-y-4 text-slate-300">{["Business goals and audience", "Brand voice and campaign message", "Approved products and visual direction", "Consistent review and customer approval"].map(x=><li key={x} className="flex gap-3"><Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />{x}</li>)}</ul></div>
      </section>

      <section id="campaign-templates" className="scroll-mt-24 border-y border-white/[.06] bg-[#0d192b] py-20 lg:py-28"><div className="mx-auto max-w-7xl px-4 sm:px-7 lg:px-10">
        <SectionIntro eyebrow="A complete campaign starting point" title="Campaign Templates" copy="Choose a proven campaign goal, then let Quae prepare the strategy, copy, product visuals, captions, video direction, and recommended channels for your review." />
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{campaignTemplates.map(([title,copy],index)=><article key={title} className={`group rounded-2xl border border-white/[.08] bg-[#111d31] p-6 ${index===6 ? "lg:col-start-2" : ""}`}><span className="text-xs font-bold uppercase tracking-[.18em] text-violet-300">Campaign Template {String(index+1).padStart(2,"0")}</span><h3 className="mt-4 text-xl font-bold">{title}</h3><p className="mt-3 leading-7 text-slate-400">{copy}</p><p className="mt-5 border-t border-white/[.07] pt-4 text-sm font-semibold text-slate-300">Strategy · Copy · Visuals · Captions · Video direction · Channels</p></article>)}</div>
      </div></section>

      <PricingSection />

      <section className="px-4 py-20 sm:px-7 lg:py-28"><div className="mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-violet-300/20 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,.3),transparent_28rem),linear-gradient(135deg,#172641,#101c30)] px-6 py-14 text-center shadow-2xl shadow-slate-950/30 sm:px-12 sm:py-18"><Sparkles className="mx-auto h-7 w-7 text-violet-300" /><h2 className="mt-5 text-3xl font-bold tracking-[-.04em] sm:text-5xl">Put your next campaign in motion.</h2><p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-300">Start with your business and goal. Quae will help turn them into a coordinated campaign you control.</p><Link href={campaignRoute} className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-violet-600 px-7 py-3 font-bold hover:bg-violet-500">Build My First Campaign <ArrowRight className="h-4 w-4" /></Link></div></section>
    </main>
    <footer className="border-t border-white/[.07]"><div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-7 lg:px-10"><Logo /><p>Quae.ai — Your AI Marketing Department</p></div></footer>
  </div>;
}

function WorkflowVisual() {
  const steps = ["Business", "Campaign Strategy", "Customer Approval", "Product Visual", "Video & Marketing Assets"];
  return <div className="relative rounded-[2rem] border border-white/[.1] bg-[#111d31]/95 p-5 shadow-2xl shadow-slate-950/40 sm:p-7"><div className="flex items-center justify-between border-b border-white/[.07] pb-5"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-300">Campaign workspace</p><p className="mt-1 text-sm text-slate-400">From business context to approved assets</p></div><BrainCircuit className="h-7 w-7 text-violet-300" /></div><ol className="mt-6 space-y-3">{steps.map((step,i)=><li key={step} className="flex items-center gap-4 rounded-xl border border-white/[.07] bg-white/[.035] p-4"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${i===2 ? "bg-emerald-400/15 text-emerald-300" : "bg-violet-400/15 text-violet-200"}`}>{i===2 ? <Check className="h-4 w-4"/> : i+1}</span><div className="min-w-0 flex-1"><p className="font-semibold">{step}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[.06]"><div className={`h-full rounded-full ${i<=2 ? "w-full bg-violet-400" : "w-2/3 bg-indigo-400/60"}`} /></div></div></li>)}</ol></div>;
}

function HowSection() {
  const steps = [["01","Tell Quae about your business","Give Quae the context it needs to understand your brand, products, and audience."],["02","Choose a goal or Campaign Template","Start from the outcome you want, not from a disconnected piece of content."],["03","Review and approve the campaign","Inspect the strategy and direction, request changes, and decide when it is ready."],["04","Create and launch marketing assets","Produce the coordinated visuals, video, social, copy, and print marketing you need."]];
  return <section id="how" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-20 sm:px-7 lg:px-10 lg:py-28"><SectionIntro eyebrow="Simple, guided, accountable" title="How Quae Works" /><ol className="mt-12 grid gap-5 lg:grid-cols-4">{steps.map(([n,title,copy])=><li key={n} className="relative rounded-2xl border border-white/[.08] bg-[#111d31] p-6"><span className="text-sm font-bold text-violet-300">{n}</span><h3 className="mt-8 text-xl font-bold">{title}</h3><p className="mt-3 leading-7 text-slate-400">{copy}</p></li>)}</ol></section>;
}

function ApprovalSection() {
 const states=["DRAFT","AI TEAM","REVIEW","CUSTOMER APPROVAL","FINAL"];
 return <section className="border-y border-white/[.06] bg-[#0d192b] py-20"><div className="mx-auto max-w-7xl px-4 sm:px-7 lg:px-10"><SectionIntro eyebrow="Customer-controlled workflow" title="Nothing is final until you approve it." copy="Quae prepares and reviews the work, while your team controls the decisions, requested changes, and final campaign direction."/><ol aria-label="Campaign approval workflow" className="mt-12 grid gap-3 md:grid-cols-5">{states.map((state,i)=><li key={state} className={`flex min-h-24 items-center justify-center rounded-xl border p-4 text-center text-xs font-extrabold tracking-[.12em] ${i===3?"border-emerald-300/30 bg-emerald-400/10 text-emerald-200":"border-white/[.08] bg-white/[.035] text-slate-200"}`}>{state}</li>)}</ol></div></section>;
}


function PricingSection() {
  const [annual, setAnnual] = useState(false);
  return <section id="pricing" className="scroll-mt-24 border-b border-white/[.06] bg-[radial-gradient(circle_at_50%_0%,rgba(124,58,237,.12),transparent_28rem)] py-18 lg:py-24">
    <div className="mx-auto max-w-7xl px-4 sm:px-7 lg:px-10">
      <div className="flex flex-col items-center justify-between gap-7 lg:flex-row lg:items-end">
        <div className="max-w-2xl text-center lg:text-left">
          <p className="text-xs font-bold uppercase tracking-[.24em] text-violet-300">Pricing</p>
          <h2 className="mt-3 text-3xl font-bold tracking-[-.04em] sm:text-4xl">Choose your marketing capacity</h2>
          <p className="mt-3 text-base leading-7 text-slate-300">Start with the plan that fits your business. Every plan gives you a coordinated AI Marketing Department.</p>
        </div>
        <div className="inline-flex shrink-0 rounded-xl border border-white/[.1] bg-[#111d31]/90 p-1 shadow-lg shadow-slate-950/20" aria-label="Billing interval">
          <button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${!annual ? "bg-white/10 text-white shadow-sm" : "text-slate-400 hover:text-white"}`}>Monthly</button>
          <button type="button" aria-pressed={annual} onClick={() => setAnnual(true)} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${annual ? "bg-violet-600 text-white shadow-lg shadow-violet-950/30" : "text-slate-400 hover:text-white"}`}>Annual <span className="text-[10px] text-emerald-300">Save 20%</span></button>
        </div>
      </div>
      <div className="mt-10 grid grid-cols-1 gap-4 min-[700px]:grid-cols-4 min-[700px]:gap-2">
        {PLAN_CATALOG.map(plan => <article key={plan.slug} className={`relative flex min-w-0 flex-col rounded-[1.4rem] border px-5 pb-5 pt-6 transition-transform min-[700px]:px-3 min-[700px]:pb-4 min-[700px]:pt-5 min-[1100px]:px-5 min-[1100px]:pb-5 min-[1100px]:pt-6 hover:-translate-y-0.5 ${plan.mostPopular ? "border-violet-400/60 bg-gradient-to-b from-violet-500/[.14] to-[#111d31] shadow-[0_22px_55px_rgba(76,29,149,.22)]" : "border-white/[.09] bg-[#111d31]/95 shadow-[0_18px_45px_rgba(2,8,23,.18)]"}`}>
          {plan.mostPopular && <p className="absolute -top-3 right-4 rounded-full border border-violet-300/30 bg-violet-600 px-3 py-1 text-[9px] font-extrabold uppercase tracking-[.15em] shadow-lg shadow-violet-950/30">Most Popular</p>}
          <div className="border-b border-white/[.07] pb-4">
            <h3 className="text-lg font-extrabold tracking-tight">{plan.name}</h3>
            <p className="mt-1 min-h-8 text-xs leading-4 text-slate-400">{plan.description}</p>
            <p className="mt-3"><span className="text-3xl font-extrabold tracking-[-.04em]">${formatUsd(plan.monthlyPriceCents)}</span><span className="text-xs text-slate-400">/mo</span></p>
            {annual && plan.annualPriceCents ? <p className="mt-1 text-[11px] font-semibold text-emerald-300">${formatUsd(plan.annualPriceCents)}/yr · save ${formatUsd(plan.monthlyPriceCents * 12 - plan.annualPriceCents)}</p> : <p className="mt-1 text-[11px] text-slate-500">Monthly billing</p>}
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-[.12em] text-violet-200">{plan.credits.toLocaleString()} credits / month</p>
          <ul className="mt-4 flex-1 space-y-2.5">{publicPlanBenefits[plan.slug].map(benefit => <li key={benefit} className="flex items-start gap-2 text-xs leading-5 text-slate-300"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" />{benefit}</li>)}</ul>
          <Link href="/signin" className={`mt-5 flex min-h-10 items-center justify-center rounded-xl text-sm font-bold transition-colors ${plan.mostPopular ? "bg-violet-600 shadow-lg shadow-violet-950/30 hover:bg-violet-500" : "border border-white/[.1] bg-white/[.05] hover:border-violet-300/30 hover:bg-white/[.09]"}`}>{plan.cta}</Link>
        </article>)}
      </div>
    </div>
  </section>;
}
