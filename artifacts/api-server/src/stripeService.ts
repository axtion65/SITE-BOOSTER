import { storage } from './storage';
import { getUncachableStripeClient } from './stripeClient';
import { PLAN_CREDITS } from './lib/falvideo';

// Map Stripe price metadata plan names to our plan keys
export function getPlanFromMetadata(metadata: Record<string, string> | null): string {
  return metadata?.plan ?? 'starter';
}

export class StripeService {
  async createCustomer(email: string, userId: string) {
    const stripe = await getUncachableStripeClient();
    return stripe.customers.create({ email, metadata: { userId } });
  }

  async createCheckoutSession(
    customerId: string, priceId: string,
    successUrl: string, cancelUrl: string
  ) {
    const stripe = await getUncachableStripeClient();
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
    const stripe = await getUncachableStripeClient();
    return stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
  }

  // Sync subscription to user record — called after checkout success
  async syncUserSubscription(userId: string) {
    const user = await storage.getUser(userId);
    if (!user?.stripeCustomerId) return null;

    const sub = await storage.getActiveSubscriptionForCustomer(user.stripeCustomerId);
    if (!sub) return null;

    // Get price to determine plan
    const stripe = await getUncachableStripeClient();
    const price = await stripe.prices.retrieve(sub.items?.data?.[0]?.price?.id ?? sub.id);
    const product = await stripe.products.retrieve(price.product as string);
    const plan = getPlanFromMetadata(product.metadata as Record<string, string>);
    const credits = PLAN_CREDITS[plan] ?? PLAN_CREDITS.starter;

    return storage.updateUserStripeInfo(userId, {
      stripeSubscriptionId: sub.id,
      plan,
      credits,
    });
  }
}

export const stripeService = new StripeService();
