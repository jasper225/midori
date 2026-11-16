import { Router } from "express";
import { logUsage, rangeUsage, todayUsage, usageSummary } from "../controllers/dailyUsage.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);
router.post("/", logUsage);
router.get("/today", todayUsage);
router.get("/range", rangeUsage);
router.get("/summary", usageSummary);

export default router;