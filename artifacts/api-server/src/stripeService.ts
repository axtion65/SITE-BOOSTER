import { storage } from './storage';
import { getStripeClient } from './stripeClient';
import { PLAN_CATALOG, PLAN_BY_SLUG, isPlanSlug, type BillingInterval, type PaidPlanSlug } from '@workspace/plans';
import type Stripe from 'stripe';

function getPlanFromMetadata(metadata: Stripe.Metadata): PaidPlanSlug | null {
  const plan = metadata?.plan;
  if (!plan || !isPlanSlug(plan) || plan === 'free') return null;
  return plan;
}

const PRICE_ENV: Record<PaidPlanSlug, Record<BillingInterval, string>> = {
  starter: { month: 'STRIPE_PRICE_STARTER_MONTHLY', year: 'STRIPE_PRICE_STARTER_ANNUAL' },
  pro: { month: 'STRIPE_PRICE_PRO_MONTHLY', year: 'STRIPE_PRICE_PRO_ANNUAL' },
  agency: { month: 'STRIPE_PRICE_AGENCY_MONTHLY', year: 'STRIPE_PRICE_AGENCY_ANNUAL' },
};

function isPaidPlanSlug(slug: string): slug is PaidPlanSlug {
  return slug !== 'free' && isPlanSlug(slug);
}

export class StripeService {
  async createCustomer(email: string, userId: string) {
    const stripe = getStripeClient();
    return stripe.customers.create({ email, metadata: { userId } });
  }

  async createCheckoutSession(
    customerId: string, priceId: string,
    successUrl: string, cancelUrl: string
  ) {
    const stripe = getStripeClient();
    return stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
  }

  async createPortalSession(customerId: string, returnUrl: string) {
    const stripe = getStripeClient();
    return stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
  }

  listPlans() {
    return PLAN_CATALOG.map(plan => ({
      id: plan.slug,
      slug: plan.slug,
      name: plan.name,
      description: plan.description,
      credits: plan.credits,
      monthlyPriceCents: plan.monthlyPriceCents,
      annualPriceCents: plan.annualPriceCents,
      features: plan.features,
      mostPopular: plan.mostPopular,
      prices: (['month', 'year'] as const).flatMap(interval => {
        if (!isPaidPlanSlug(plan.slug)) return [];
        const id = process.env[PRICE_ENV[plan.slug][interval]];
        if (!id) return [];
        return [{
          id,
          unitAmount: interval === 'month' ? plan.monthlyPriceCents : plan.annualPriceCents,
          currency: 'usd',
          recurring: { interval },
        }];
      }),
    }));
  }

  isConfiguredPriceId(priceId: string): boolean {
    return Object.values(PRICE_ENV).some(intervals =>
      Object.values(intervals).some(envName => process.env[envName] === priceId),
    );
  }

  async syncUserSubscription(userId: string) {
    const user = await storage.getUser(userId);
    if (!user?.stripeCustomerId) return null;

    const stripe = getStripeClient();
    const subs = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: 'active',
      limit: 1,
    });

    const sub = subs.data[0];
    if (!sub) return null;

    const price = await stripe.prices.retrieve(sub.items.data[0].price.id, {
      expand: ['product'],
    });
    const product = price.product as Stripe.Product;
    const plan = getPlanFromMetadata(product.metadata);
    if (!plan) throw new Error(`Stripe product ${product.id} has no valid plan metadata`);
    const credits = PLAN_BY_SLUG[plan].credits;

    return storage.updateUserStripeInfo(userId, {
      stripeSubscriptionId: sub.id,
      plan,
      credits,
    });
  }
}

export const stripeService = new StripeService();
