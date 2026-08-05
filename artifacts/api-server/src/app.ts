import express, { type Express } from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import type { Request, Response } from "express";
import router from "./routes";
import { WebhookHandlers } from "./webhookHandlers";
import { logger } from "./lib/logger";

const app: Express = express();

// Stripe webhook MUST be registered before express.json() — needs raw Buffer
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) { res.status(400).json({ error: "Missing stripe-signature" }); return; }
    const sig = Array.isArray(signature) ? signature[0] : signature;
    try {
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (err: any) {
      console.error("[stripe-webhook] error:", err.message);
      res.status(400).json({ error: "Webhook error" });
    }
  }
);

app.use(pinoHttp({
  logger,
  serializers: {
    req(req: Request) {
      return { id: (req as any).id, method: req.method, url: req.url?.split("?")[0] };
    },
    res(res: Response) {
      return { statusCode: res.statusCode };
    },
  },
}));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", router);

export default app;
