import { storage } from './storage';
import { getStripeClient } from './stripeClient';
import { PLAN_CATALOG, PLAN_BY_SLUG, isPlanSlug, type PaidPlanSlug } from '@workspace/plans';
import type Stripe from 'stripe';
import { resolveStripePriceId } from './lib/billingConfig';

function getPlanFromMetadata(metadata: Stripe.Metadata): PaidPlanSlug | null {
  const plan = metadata?.plan;
  if (!plan || !isPlanSlug(plan) || plan === 'free') return null;
  return plan;
}

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
        const id = resolveStripePriceId(plan.slug, interval);
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
    return (['starter', 'pro', 'agency'] as const).some(plan =>
      (['month', 'year'] as const).some(interval =>
        resolveStripePriceId(plan, interval) === priceId,
      ),
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
      subscriptionStatus: sub.status,
      billingInterval: price.recurring?.interval ?? null,
    });
  }
}

export const stripeService = new StripeService();
