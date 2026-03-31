import express from "express";
import {
  getSyncByIdController,
  getSyncsController,
  getSyncsCountController,
} from "../controllers/syncController.js";

const syncRouter = express.Router();

syncRouter.get("/", getSyncsController);
syncRouter.get("/count", getSyncsCountController);
syncRouter.get("/:id", getSyncByIdController);

export default syncRouter;
