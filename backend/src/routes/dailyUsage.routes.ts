import { Router } from "express";
import { logUsage, rangeUsage, todayUsage } from "../controllers/dailyUsage.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);
router.post("/", logUsage);
router.get("/today", todayUsage);
router.get("/range", rangeUsage);

export default router;