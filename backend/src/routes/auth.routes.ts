import { Router } from "express";
import { register, login, logout, getProfile, extensionLogin } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/extension-login", extensionLogin);
router.post("/logout", logout);
router.get("/me", requireAuth, getProfile);

export default router;