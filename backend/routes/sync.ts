import express from "express";
import { getAllSyncsCountController } from "../controllers/syncController.js";

const syncRouter = express.Router();

syncRouter.get("/count", getAllSyncsCountController);

export default syncRouter;
