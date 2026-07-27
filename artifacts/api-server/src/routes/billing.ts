import { Router } from "express";
import { storage } from "../storage";
import { stripeService } from "../stripeService";

const router = Router();

function getUserIdFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const decoded = Buffer.from(authHeader.slice(7), "base64url").toString("utf-8");
    return decoded.split(":")[0] || null;
  } catch { return null; }
}

// GET /api/billing/plans — return plans from Stripe
router.get("/billing/plans", async (_req, res) => {
  try {
    const plans = await stripeService.listPlans();
    res.json({ plans });
  } catch (err) {
    console.error("[billing] plans error", err);
    res.status(500).json({ error: "Failed to load plans" });
  }
});

// POST /api/billing/checkout — create Stripe checkout session
router.post("/billing/checkout", async (req, res) => {
  const userId = getUserIdFromHeader(req.headers.authorization);
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

    const domain = process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : "http://localhost:3000";

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
  const userId = getUserIdFromHeader(req.headers.authorization);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  try {
    const user = await storage.getUser(userId);
    if (!user?.stripeCustomerId) { res.status(400).json({ error: "No billing account found" }); return; }

    const domain = process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : "http://localhost:3000";

    const session = await stripeService.createPortalSession(user.stripeCustomerId, `${domain}/studio/dashboard`);
    res.json({ url: session.url });
  } catch (err: any) {
    console.error("[billing] portal error", err);
    res.status(500).json({ error: "Portal failed" });
  }
});

// POST /api/billing/sync — sync subscription to user after checkout success
router.post("/billing/sync", async (req, res) => {
  const userId = getUserIdFromHeader(req.headers.authorization);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  try {
    const updated = await stripeService.syncUserSubscription(userId);
    if (!updated) { res.json({ synced: false }); return; }
    // Send plan upgrade confirmation email
    import("../lib/email").then(({ sendPlanUpgradeEmail }) =>
      sendPlanUpgradeEmail(updated.email, updated.name ?? "", updated.plan, updated.credits).catch(() => {})
    );
    res.json({ synced: true, plan: updated.plan, credits: updated.credits });
  } catch (err: any) {
    console.error("[billing] sync error", err);
    res.status(500).json({ error: "Sync failed" });
  }
});

export default router;
