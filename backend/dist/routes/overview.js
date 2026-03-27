import express from "express";
import { getOverviewDailyCountsController, getOverviewDateBoundsController, } from "../controllers/overviewController.js";
const overviewRouter = express.Router();
overviewRouter.get("/daily-counts", getOverviewDailyCountsController);
overviewRouter.get("/date-bounds", getOverviewDateBoundsController);
export default overviewRouter;
