import { getStripeClient } from './stripeClient';
import { storage } from './storage';
import { stripeService } from './stripeService';
import {
  recordStripeWebhookAttempt,
  recordStripeWebhookFailure,
  recordStripeWebhookSuccess,
} from './lib/stripeWebhookLedger';
import { logger } from './lib/logger';
import { safeErrorMetadata } from './lib/safeErrorMetadata';

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

  // Stripe can deliver older events after newer ones. Reconcile its current
  // subscription state, never the status/plan frozen in an earlier event.
  const current = await stripe.subscriptions.retrieve(sub.id);
  const result = await stripeService.syncSubscriptionToUser(user.id, current);

  console.log(`[webhook] Subscription updated — grant=${result?.grantReason ?? "none"}`);
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const user = await storage.getUserByStripeCustomerId(customerId);
  if (!user) return;

  const updated = await storage.endUserSubscription(user.id, sub.id, sub.status);
  if (updated) console.log("[webhook] Subscription deleted — account returned to free plan");
}
