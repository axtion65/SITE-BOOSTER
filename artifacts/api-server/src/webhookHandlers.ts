import { getStripeClient } from './stripeClient';
import { storage } from './storage';
import { PLAN_CREDITS } from './lib/falvideo';

function getPlanFromMetadata(metadata: Stripe.Metadata): string {
  return metadata?.plan ?? 'starter';
}

import type Stripe from 'stripe';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'Payload must be a Buffer. Ensure webhook route is registered BEFORE express.json().'
      );
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const stripe = getStripeClient();

    let event: Stripe.Event;
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } else {
      // In dev without a webhook secret — parse raw and trust it
      console.warn('[webhook] No STRIPE_WEBHOOK_SECRET set — skipping signature verification');
      event = JSON.parse(payload.toString()) as Stripe.Event;
    }

    console.log(`[webhook] ${event.type}`);

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(stripe, sub);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(sub);
        break;
      }
      default:
        break;
    }
  }
}

async function handleSubscriptionChange(stripe: Stripe, sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const user = await storage.getUserByStripeCustomerId(customerId);
  if (!user) {
    console.warn(`[webhook] No user for customer ${customerId}`);
    return;
  }

  const priceId = sub.items.data[0]?.price?.id;
  if (!priceId) return;

  const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
  const product = price.product as Stripe.Product;
  const plan = getPlanFromMetadata(product.metadata);
  const credits = PLAN_CREDITS[plan] ?? PLAN_CREDITS.starter;

  await storage.updateUserStripeInfo(user.id, {
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    plan,
    credits,
  });

  console.log(`[webhook] Updated user ${user.id} → plan=${plan} credits=${credits}`);
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const user = await storage.getUserByStripeCustomerId(customerId);
  if (!user) return;

  await storage.updateUserStripeInfo(user.id, {
    stripeSubscriptionId: null,
    plan: 'free',
    credits: PLAN_CREDITS.free,
  });

  console.log(`[webhook] Downgraded user ${user.id} to free`);
}
