import { Router } from "express";
import { register, login, logout, getProfile } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.post("/", register);
router.post("/", login);
router.post("/", logout);
router.get("/", requireAuth, getProfile);

export default router;