import { Router } from "express";
import {
  getCloudProjectDetailsController,
  listCloudProjectsController,
} from "../controllers/cloudController.js";

const router = Router();

router.get("/projects", listCloudProjectsController);
router.get(
  "/projects/:hubId/:projectId/details",
  getCloudProjectDetailsController,
);

export default router;
