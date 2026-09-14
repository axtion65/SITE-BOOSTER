import { getStripeClient } from './stripeClient';
import { storage } from './storage';
import { PLAN_BY_SLUG, isPlanSlug, type PaidPlanSlug } from '@workspace/plans';
import { applyPaidSubscriptionSnapshot } from './lib/subscriptionCredits';
import {
  recordStripeWebhookAttempt,
  recordStripeWebhookFailure,
  recordStripeWebhookSuccess,
} from './lib/stripeWebhookLedger';
import { logger } from './lib/logger';
import { safeErrorMetadata } from './lib/safeErrorMetadata';

function getPlanFromMetadata(metadata: Stripe.Metadata): PaidPlanSlug | null {
  const plan = metadata?.plan;
  if (!plan || !isPlanSlug(plan) || plan === 'free') return null;
  return plan;
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
    if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is required');
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    const action = await recordStripeWebhookAttempt(event.id, event.type);
    if (action === 'already_succeeded') {
      logger.info({ eventId: event.id, eventType: event.type }, 'Ignoring an already completed Stripe webhook');
      return;
    }

    try {
      logger.info({ eventId: event.id, eventType: event.type }, 'Processing Stripe webhook');
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
      await recordStripeWebhookSuccess(event.id);
    } catch (error) {
      try {
        await recordStripeWebhookFailure(event.id, error);
      } catch (ledgerError) {
        logger.error({ ...safeErrorMetadata(ledgerError), eventId: event.id, eventType: event.type }, 'Failed to record Stripe webhook failure');
      }
      logger.error({ ...safeErrorMetadata(error), eventId: event.id, eventType: event.type }, 'Stripe webhook processing failed');
      throw error;
    }
  }
}

async function handleSubscriptionChange(stripe: Stripe, sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const user = await storage.getUserByStripeCustomerId(customerId);
  if (!user) {
    console.warn("[webhook] No user for Stripe customer");
    return;
  }

  const priceId = sub.items.data[0]?.price?.id;
  if (!priceId) return;

  const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
  const product = price.product as Stripe.Product;
  const plan = getPlanFromMetadata(product.metadata);
  if (!plan) throw new Error(`Stripe product ${product.id} has no valid plan metadata`);
  const result = await applyPaidSubscriptionSnapshot(user.id, {
    customerId,
    subscriptionId: sub.id,
    plan,
    status: sub.status,
    billingInterval: price.recurring?.interval ?? null,
    anchorAt: new Date(sub.start_date * 1000),
  });

  console.log(`[webhook] Subscription updated — plan=${plan} grant=${result?.grantReason ?? "none"}`);
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const user = await storage.getUserByStripeCustomerId(customerId);
  if (!user) return;

  await storage.updateUserStripeInfo(user.id, {
    stripeSubscriptionId: null,
    plan: 'free',
    credits: PLAN_BY_SLUG.free.credits,
    subscriptionStatus: sub.status,
    billingInterval: null,
    creditCycleAnchorAt: null,
    creditRefreshAt: null,
  });

  console.log(`[webhook] Downgraded user ${user.id} to free`);
}
