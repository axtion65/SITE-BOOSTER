import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";

const EFFECTIVE_DATE = "September 11, 2026";
const SUPPORT_EMAIL = "info@quae.ai";
const OPERATOR = "JB@H Procurement Group LLC";

function Shell({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#091322] text-white">
      <header className="border-b border-white/[.08] bg-[#091322]/95">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3 font-black">
            <img src="/images/logo-icon.png" alt="" className="h-9 w-9 object-contain" />
            <span>Quae<span className="text-violet-400">.ai</span></span>
          </Link>
          <Link href="/" className="text-sm font-semibold text-slate-300 hover:text-white">Back to Quae.ai</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
        <p className="text-xs font-black uppercase tracking-[.2em] text-violet-300">Quae.ai</p>
        <h1 className="mt-3 text-4xl font-black tracking-[-.04em] sm:text-5xl">{title}</h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300">{summary}</p>
        <p className="mt-3 text-xs text-slate-500">Effective {EFFECTIVE_DATE}</p>
        <div className="mt-10 space-y-8 text-sm leading-7 text-slate-300">{children}</div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section><h2 className="text-xl font-black text-white">{title}</h2><div className="mt-3 space-y-3">{children}</div></section>;
}

export function PrivacyPolicy() {
  return <Shell title="Privacy Policy" summary="This policy explains what information Quae.ai collects, why we use it, and the choices available to customers.">
    <Section title="Information we collect">
      <p>We may collect account details, business and brand information, campaign briefs, product details, uploaded files, generated assets, usage and diagnostic data, support messages, and billing identifiers. Payment card details are processed by Stripe and are not stored as full card numbers by Quae.ai.</p>
    </Section>
    <Section title="How we use information">
      <p>We use information to provide and secure the service, authenticate accounts, process subscriptions, generate and store requested marketing assets, operate customer support, prevent abuse, diagnose failures, and improve reliability and product quality.</p>
    </Section>
    <Section title="Service providers">
      <p>We use service providers for hosting, infrastructure, payments, email, storage, analytics, and AI or media generation. These providers receive only the information reasonably needed to perform their services for Quae.ai.</p>
    </Section>
    <Section title="Data retention and security">
      <p>We retain information for as long as reasonably necessary to provide the service, meet legal and accounting obligations, resolve disputes, and protect the platform. We use technical and organizational safeguards, but no online service can guarantee absolute security.</p>
    </Section>
    <Section title="Your choices">
      <p>You may request access, correction, or deletion of personal information where applicable. Some records may need to be retained for legal, fraud-prevention, billing, or security purposes.</p>
    </Section>
    <Section title="Contact">
      <p>Privacy questions can be sent to <a className="font-semibold text-violet-300 underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Quae.ai is operated by {OPERATOR}.</p>
    </Section>
  </Shell>;
}

export function TermsOfService() {
  return <Shell title="Terms of Service" summary="These terms govern use of Quae.ai, including its AI-assisted campaign, creative, billing, and account features.">
    <Section title="Using Quae.ai">
      <p>You must be legally able to enter into a contract and, when using Quae.ai for a business or organization, have authority to act for that business or organization. You are responsible for maintaining account security and for activity performed through your account.</p>
    </Section>
    <Section title="Your content and AI-generated output">
      <p>You retain rights you have in content you submit. You grant Quae.ai the limited rights needed to host, process, transform, and transmit that content to provide the service. AI-generated outputs may not be unique. You are responsible for reviewing final claims, rights, disclosures, and suitability before publishing or distributing marketing materials.</p>
    </Section>
    <Section title="Subscriptions, credits, and billing">
      <p>Paid plans renew according to the billing interval selected at checkout until canceled. Plan credits and features are governed by the plan shown at purchase and in the customer account. Billing is processed through Stripe. Cancellation and refund rules are described in our <Link className="font-semibold text-violet-300 underline" href="/refund-policy">Cancellation &amp; Refund Policy</Link>.</p>
    </Section>
    <Section title="Acceptable use">
      <p>You may not use Quae.ai to violate law, infringe intellectual-property or privacy rights, distribute malware, interfere with the service, bypass access controls or usage limits, or create deceptive or harmful content prohibited by applicable law.</p>
    </Section>
    <Section title="Availability and changes">
      <p>We work to keep Quae.ai available and reliable, but the service may occasionally be unavailable for maintenance, provider outages, security events, or other operational reasons. Features may evolve as the product changes.</p>
    </Section>
    <Section title="Disclaimers and responsibility">
      <p>Quae.ai is provided on an "as available" basis to the extent permitted by law. AI assistance does not replace your responsibility to review business, advertising, legal, factual, or regulatory claims before use. Nothing in these terms limits rights or remedies that cannot legally be waived.</p>
    </Section>
    <Section title="Contact">
      <p>Questions about these terms can be sent to <a className="font-semibold text-violet-300 underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Quae.ai is operated by {OPERATOR}.</p>
    </Section>
  </Shell>;
}

export function RefundPolicy() {
  return <Shell title="Cancellation & Refund Policy" summary="This policy describes how Quae.ai subscriptions can be canceled and how refund requests are handled.">
    <Section title="Canceling a subscription">
      <p>You may cancel a paid subscription through the Manage Subscription link in Quae.ai. Cancellation takes effect at the end of the current paid billing period. Your paid plan remains available through that period unless access is restricted for a separate account or safety reason.</p>
    </Section>
    <Section title="Renewals">
      <p>Subscriptions renew automatically on the selected monthly or annual billing interval until canceled. To avoid the next renewal charge, cancel before the renewal date shown in your billing portal.</p>
    </Section>
    <Section title="Refunds and proration">
      <p>Quae.ai does not automatically issue prorated refunds or credits for an unused portion of a billing period after cancellation. Charges already paid are generally non-refundable except where required by applicable law or where Quae.ai approves a request for a duplicate, incorrect, or exceptional charge.</p>
    </Section>
    <Section title="Billing problems">
      <p>If you believe a charge is incorrect, contact <a className="font-semibold text-violet-300 underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with the account email and charge details. Do not send full card numbers or other sensitive payment credentials by email.</p>
    </Section>
  </Shell>;
}

export function ContactSupport() {
  return <Shell title="Contact & Support" summary="Use the options below for account, billing, privacy, or product support.">
    <Section title="Customer support">
      <p>Email <a className="font-semibold text-violet-300 underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> for account access, billing questions, product issues, or help using Quae.ai.</p>
    </Section>
    <Section title="Billing and cancellation">
      <p>Paid customers can open the Stripe customer portal from Plan &amp; Credits → Manage Subscription. Cancellation takes effect at the end of the current paid billing period.</p>
    </Section>
    <Section title="Feedback">
      <p>You can also use the Feedback control inside Quae.ai. If a feedback submission cannot be stored, the site keeps your message available for retry and provides this support email as a fallback.</p>
    </Section>
    <Section title="Business information">
      <p>Quae.ai is the customer-facing service operated by {OPERATOR}.</p>
    </Section>
  </Shell>;
}

const PUBLIC_TRUST_PATHS = new Set(["/", "/signin", "/privacy", "/terms", "/refund-policy", "/contact"]);

export function PublicTrustLinks() {
  const [location] = useLocation();
  if (!PUBLIC_TRUST_PATHS.has(location)) return null;
  return <div className="border-t border-white/[.07] bg-[#091322] text-slate-400">
    <nav aria-label="Legal and support" className="mx-auto flex max-w-5xl flex-wrap justify-center gap-x-6 gap-y-2 px-5 py-5 text-xs sm:px-8">
      <Link href="/privacy" className="hover:text-white">Privacy</Link>
      <Link href="/terms" className="hover:text-white">Terms</Link>
      <Link href="/refund-policy" className="hover:text-white">Cancellation &amp; Refunds</Link>
      <Link href="/contact" className="hover:text-white">Contact</Link>
      <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-white">{SUPPORT_EMAIL}</a>
    </nav>
  </div>;
}
