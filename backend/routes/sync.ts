import express from "express";
import { getSyncsCountController } from "../controllers/syncController.js";

const syncRouter = express.Router();

syncRouter.get("/count", getSyncsCountController);

export default syncRouter;
