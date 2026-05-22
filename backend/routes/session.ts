import express from "express";
import {
  getSessionByIdController,
  getSessionFilterOptionsController,
  getSessionsController,
  getSessionsCountController,
} from "../controllers/sessionsController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
const sessionRouter = express.Router();

sessionRouter.use(authMiddleware);

sessionRouter.get("/count", getSessionsCountController);
sessionRouter.get("/filter-options", getSessionFilterOptionsController);
sessionRouter.get("/:id", getSessionByIdController);
sessionRouter.get("/", getSessionsController);

export default sessionRouter;
