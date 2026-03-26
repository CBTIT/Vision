import express from "express";
import {
  getSessionsController,
  getSessionsCountController,
} from "../controllers/sessionsController.js";
const sessionRouter = express.Router();

sessionRouter.get("/", getSessionsController);
sessionRouter.get("/count", getSessionsCountController);

export default sessionRouter;
