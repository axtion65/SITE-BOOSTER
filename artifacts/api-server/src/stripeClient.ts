import Stripe from 'stripe';

export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_API_KEY;
  if (!key) throw new Error('STRIPE_API_KEY is not set');
  return new Stripe(key);
}
