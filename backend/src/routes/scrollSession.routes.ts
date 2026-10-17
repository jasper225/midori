import { Router } from "express";
import { endSession, startSession } from "../controllers/scrollSession.controller.js"
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);
router.post("/", startSession);
router.post("/:id/end", endSession);

export default router;
