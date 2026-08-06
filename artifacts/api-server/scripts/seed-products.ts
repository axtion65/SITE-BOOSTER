/**
 * Seed Stripe products for Quae.ai
 * Run: pnpm exec tsx artifacts/api-server/scripts/seed-products.ts
 *
 * Plans:
 *   Starter  $23/mo  | $220.80/yr (save 20%)  → 600 credits/mo
 *   Pro      $49/mo  | $470.40/yr (save 20%)  → 2,000 credits/mo
 *   Agency   $99/mo  | $950.40/yr (save 20%)  → 6,000 credits/mo
 */

import Stripe from 'stripe';
import { PAID_PLANS } from '@workspace/plans';

const key = process.env.STRIPE_API_KEY;
if (!key) { console.error('STRIPE_API_KEY not set'); process.exit(1); }
const stripe = new Stripe(key);

async function seed() {
  for (const plan of PAID_PLANS) {
    const existing = await stripe.products.search({
      query: `name:'${plan.name}' AND active:'true'`,
    });

    if (existing.data.length > 0) {
      console.log(`✓ ${plan.name} already exists (${existing.data[0].id})`);
      continue;
    }

    const product = await stripe.products.create({
      name: plan.name,
      description: `${plan.description}. ${plan.credits.toLocaleString()} credits/month.`,
      metadata: { plan: plan.slug, credits: String(plan.credits) },
    });

    const monthly = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.monthlyPriceCents,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { plan: plan.slug, billing: "monthly" },
    });

    const annual = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.annualPriceCents,
      currency: "usd",
      recurring: { interval: "year" },
      metadata: { plan: plan.slug, billing: "annual" },
    });

    console.log(`✓ Created ${plan.name}: monthly=${monthly.id} annual=${annual.id}`);
  }

  console.log("\n✅ Done. Products and prices are ready in your Stripe account.");
}

seed().catch((err) => { console.error(err); process.exit(1); });
