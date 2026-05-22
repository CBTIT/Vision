import { Router } from "express";
import {
  getCloudProjectDetailsController,
  listCloudProjectsController,
} from "../controllers/cloudController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/projects", listCloudProjectsController);
router.get(
  "/projects/:hubId/:projectId/details",
  getCloudProjectDetailsController,
);

export default router;
