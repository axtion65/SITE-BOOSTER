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

export default router;
