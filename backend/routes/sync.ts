import express from "express";
import {
  getSyncByIdController,
  getSyncsController,
  getSyncsCountController,
} from "../controllers/syncController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const syncRouter = express.Router();

syncRouter.use(authMiddleware);

syncRouter.get("/", getSyncsController);
syncRouter.get("/count", getSyncsCountController);
syncRouter.get("/:id", getSyncByIdController);

export default syncRouter;
