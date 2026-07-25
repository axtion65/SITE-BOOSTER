import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { stripeService } from "../stripeService";

const router = Router();

async function getUserId(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const decoded = Buffer.from(authHeader.slice(7), "base64url").toString("utf-8");
    return decoded.split(":")[0] || null;
  } catch { return null; }
}

// GET /api/billing/plans — return products with prices from Stripe
router.get("/billing/plans", async (_req, res) => {
  try {
    const rows = await storage.listProductsWithPrices();
    const map = new Map<string, any>();
    for (const row of rows as any[]) {
      if (!map.has(row.product_id)) {
        map.set(row.product_id, {
          id: row.product_id,
          name: row.product_name,
          description: row.description,
          metadata: row.metadata ?? {},
          prices: [],
        });
      }
      if (row.price_id) {
        map.get(row.product_id).prices.push({
          id: row.price_id,
          unitAmount: row.unit_amount,
          currency: row.currency,
          recurring: row.recurring,
        });
      }
    }
    res.json({ plans: Array.from(map.values()) });
  } catch (err) {
    console.error("[billing] plans error", err);
    res.status(500).json({ error: "Failed to load plans" });
  }
});

// POST /api/billing/checkout — create Stripe checkout session
router.post("/billing/checkout", async (req, res) => {
  const userId = await getUserId(req.headers.authorization);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const { priceId } = req.body;
  if (!priceId) { res.status(400).json({ error: "priceId required" }); return; }

  try {
    const user = await storage.getUser(userId);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeService.createCustomer(user.email, user.id);
      await storage.updateUserStripeInfo(userId, { stripeCustomerId: customer.id });
      customerId = customer.id;
    }

    const domain = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    const session = await stripeService.createCheckoutSession(
      customerId, priceId,
      `${domain}/studio/dashboard?checkout_success=true`,
      `${domain}/studio/dashboard`
    );

    res.json({ url: session.url });
  } catch (err: any) {
    console.error("[billing] checkout error", err);
    res.status(500).json({ error: "Checkout failed" });
  }
});

// POST /api/billing/portal — customer billing portal
router.post("/billing/portal", async (req, res) => {
  const userId = await getUserId(req.headers.authorization);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  try {
    const user = await storage.getUser(userId);
    if (!user?.stripeCustomerId) { res.status(400).json({ error: "No billing account found" }); return; }

    const domain = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    const session = await stripeService.createPortalSession(user.stripeCustomerId, `${domain}/studio/dashboard`);
    res.json({ url: session.url });
  } catch (err: any) {
    console.error("[billing] portal error", err);
    res.status(500).json({ error: "Portal failed" });
  }
});

// POST /api/billing/sync — sync subscription after checkout success
router.post("/billing/sync", async (req, res) => {
  const userId = await getUserId(req.headers.authorization);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  try {
    const updated = await stripeService.syncUserSubscription(userId);
    if (!updated) { res.json({ synced: false }); return; }
    res.json({ synced: true, plan: updated.plan, credits: updated.credits });
  } catch (err: any) {
    console.error("[billing] sync error", err);
    res.status(500).json({ error: "Sync failed" });
  }
});

export default router;
