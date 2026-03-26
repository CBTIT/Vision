import express from "express";
import {
  getAllSessions,
  getAllSessionsCount,
} from "../controllers/sessionsController.js";
const sessionRouter = express.Router();

sessionRouter.get("/", getAllSessions);
sessionRouter.get("/count", getAllSessionsCount);

export default sessionRouter;
