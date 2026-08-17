import { Router, type IRouter, type Request, type Response } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function health(_req: Request, res: Response) {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
}

// /api/health is the public deployment probe used to verify that Quae's
// Vercel proxy reaches Railway rather than returning the SPA document.
router.get("/health", health);
router.get("/healthz", health);

export default router;
