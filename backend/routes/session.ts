import express from "express";
import {
  getSessionByIdController,
  getSessionFilterOptionsController,
  getSessionsController,
  getSessionsCountController,
} from "../controllers/sessionsController.js";
const sessionRouter = express.Router();

sessionRouter.get("/count", getSessionsCountController);
sessionRouter.get("/filter-options", getSessionFilterOptionsController);
sessionRouter.get("/:id", getSessionByIdController);
sessionRouter.get("/", getSessionsController);

export default sessionRouter;
