import { Router } from "express";
import { endSession, startSession } from "../controllers/scrollSession.controller.js"
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.post("/", requireAuth, startSession);
router.post("/:id/end", requireAuth, endSession);

export default router;
