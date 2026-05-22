import express from "express";
import {
  getOverviewDailyCountsController,
  getOverviewDateBoundsController,
} from "../controllers/overviewController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const overviewRouter = express.Router();

overviewRouter.use(authMiddleware);

overviewRouter.get("/daily-counts", getOverviewDailyCountsController);
overviewRouter.get("/date-bounds", getOverviewDateBoundsController);

export default overviewRouter;
