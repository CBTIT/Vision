import express from "express";
import { getSyncsController, getSyncsCountController, } from "../controllers/syncController.js";
const syncRouter = express.Router();
syncRouter.get("/", getSyncsController);
syncRouter.get("/count", getSyncsCountController);
export default syncRouter;
