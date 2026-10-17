import { Router } from "express";
import { addSite, deleteSite, getSites } from "../controllers/trackedSites.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);
router.post("/", addSite);
router.get("/", getSites);
router.delete("/:id/delete", deleteSite);

export default router;