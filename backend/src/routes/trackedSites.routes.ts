import { Router } from "express";
import { addSite, deleteSite, getSites, updateSite } from "../controllers/trackedSites.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);
router.post("/", addSite);
router.get("/", getSites);
router.patch("/:id", updateSite);
router.delete("/:id", deleteSite);

export default router;