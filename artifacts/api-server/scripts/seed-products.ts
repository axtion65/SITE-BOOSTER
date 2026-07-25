/**
 * Seed Stripe products for Quae.ai
 * Run: pnpm exec tsx artifacts/api-server/scripts/seed-products.ts
 *
 * Plans:
 *   Starter  $29/mo  | $278.40/yr (save 20%)  → 600 credits/mo
 *   Pro      $49/mo  | $470.40/yr (save 20%)  → 2,000 credits/mo
 *   Agency   $149/mo | $1,430.40/yr (save 20%)→ 6,000 credits/mo
 */

import Stripe from 'stripe';

const key = process.env.STRIPE_API_KEY;
if (!key) { console.error('STRIPE_API_KEY not set'); process.exit(1); }
const stripe = new Stripe(key);

const PLANS = [
  {
    name: "Starter",
    description: "For solo creators and small brands. 600 credits/month.",
    metadata: { plan: "starter", credits: "600" },
    monthly: 2900,
    annual: 27840, // $29 × 12 × 0.80
  },
  {
    name: "Pro",
    description: "For growing brands and content teams. 2,000 credits/month.",
    metadata: { plan: "pro", credits: "2000" },
    monthly: 4900,
    annual: 47040,
  },
  {
    name: "Agency",
    description: "For agencies and high-volume creators. 6,000 credits/month.",
    metadata: { plan: "agency", credits: "6000" },
    monthly: 14900,
    annual: 143040,
  },
];

async function seed() {
  for (const plan of PLANS) {
    const existing = await stripe.products.search({
      query: `name:'${plan.name}' AND active:'true'`,
    });

    if (existing.data.length > 0) {
      console.log(`✓ ${plan.name} already exists (${existing.data[0].id})`);
      continue;
    }

    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata: plan.metadata,
    });

    const monthly = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.monthly,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { plan: plan.metadata.plan, billing: "monthly" },
    });

    const annual = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.annual,
      currency: "usd",
      recurring: { interval: "year" },
      metadata: { plan: plan.metadata.plan, billing: "annual" },
    });

    console.log(`✓ Created ${plan.name}: monthly=${monthly.id} annual=${annual.id}`);
  }

  console.log("\n✅ Done. Products and prices are ready in your Stripe account.");
}

seed().catch((err) => { console.error(err); process.exit(1); });
