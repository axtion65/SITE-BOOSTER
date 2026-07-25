import { storage } from './storage';
import { getStripeClient } from './stripeClient';
import { PLAN_CREDITS } from './lib/falvideo';
import type Stripe from 'stripe';

function getPlanFromMetadata(metadata: Stripe.Metadata): string {
  return metadata?.plan ?? 'starter';
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

  async listPlans() {
    const stripe = getStripeClient();
    const products = await stripe.products.list({ active: true, expand: ['data.default_price'] });
    const prices = await stripe.prices.list({ active: true });

    const pricesByProduct: Record<string, Stripe.Price[]> = {};
    for (const price of prices.data) {
      const productId = typeof price.product === 'string' ? price.product : price.product.id;
      if (!pricesByProduct[productId]) pricesByProduct[productId] = [];
      pricesByProduct[productId].push(price);
    }

    return products.data
      .filter(p => p.metadata?.plan) // only our plan products
      .map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        metadata: p.metadata,
        prices: (pricesByProduct[p.id] ?? []).map(pr => ({
          id: pr.id,
          unitAmount: pr.unit_amount,
          currency: pr.currency,
          recurring: pr.recurring,
        })),
      }))
      .sort((a, b) => {
        const order = ['starter', 'pro', 'agency'];
        return order.indexOf(a.metadata.plan) - order.indexOf(b.metadata.plan);
      });
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
    const credits = PLAN_CREDITS[plan] ?? PLAN_CREDITS.starter;

    return storage.updateUserStripeInfo(userId, {
      stripeSubscriptionId: sub.id,
      plan,
      credits,
    });
  }
}

export const stripeService = new StripeService();
