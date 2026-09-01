import express, { type Express, type NextFunction } from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import type { Request, Response } from "express";
import router from "./routes";
import { WebhookHandlers } from "./webhookHandlers";
import { logger } from "./lib/logger";
import { readFalWebhookHeaders, verifyFalWebhookSignature } from "./lib/falWebhookSignature";
import { processFalCompletion, type FalCompletionEvent } from "./routes/webhooks";

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

// fal completion must also be registered before express.json(): signature
// verification covers the exact raw bytes fal sent, not re-serialized JSON.
app.post(
  "/api/webhooks/fal",
  express.raw({ type: "application/json", limit: "2mb" }),
  async (req, res) => {
    const rawBody = req.body as Buffer;
    const headers = readFalWebhookHeaders(req.headers);
    if (!headers || !Buffer.isBuffer(rawBody)) {
      res.status(401).json({ error: "Invalid fal webhook" });
      return;
    }

    try {
      if (!await verifyFalWebhookSignature(rawBody, headers)) {
        res.status(401).json({ error: "Invalid fal webhook signature" });
        return;
      }

      const event = JSON.parse(rawBody.toString("utf8")) as Partial<FalCompletionEvent>;
      if (
        event.request_id !== headers.requestId ||
        (event.status !== "OK" && event.status !== "ERROR")
      ) {
        res.status(400).json({ error: "Invalid fal webhook payload" });
        return;
      }

      await processFalCompletion(event as FalCompletionEvent);
      res.status(200).json({ ok: true });
    } catch (err) {
      // A transient JWKS/database problem must return non-2xx so fal retries the
      // same request_id. The completion path itself is idempotent.
      logger.error({ err }, "fal webhook processing failed");
      res.status(503).json({ error: "Webhook temporarily unavailable" });
    }
  },
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

// Global error handler — Express 5 routes async rejections here automatically.
// Logs the PostgreSQL error code/detail so Railway logs show the real cause.
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({
    err,
    pg_code: err.code,
    pg_detail: err.detail,
    pg_hint: err.hint,
    pg_table: err.table,
    pg_constraint: err.constraint,
  }, "Unhandled route error");
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default app;
