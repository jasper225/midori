import { Router } from "express";
import { listMoods, upsertMood } from "../controllers/mood.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);
router.post("/", upsertMood);
router.get("/", listMoods);

export default router;
