import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import studioRouter from "./studio";
import templatesRouter from "./templates";
import projectsRouter from "./projects";
import adminRouter from "./admin";
import billingRouter from "./billing";
import feedbackRouter from "./feedback";
import storageRouter from "./storage";
import webhooksRouter from "./webhooks";
import debugFalRouter from "./debugFal";
import marketingRouter from "./marketing";
import campaignsRouter from "./campaigns";
import mockupsRouter from "./mockups";
import websiteImportsRouter from "./websiteImports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(studioRouter);
router.use(templatesRouter);
router.use(projectsRouter);
router.use(adminRouter);
router.use(billingRouter);
router.use(feedbackRouter);
router.use(storageRouter);
router.use(webhooksRouter);
router.use(debugFalRouter);
router.use(marketingRouter);
router.use(campaignsRouter);
router.use(mockupsRouter);
router.use(websiteImportsRouter);

export default router;
