import express from "express";
import { getPluginUseCountController, getPluginUseListController, } from "../controllers/pluginController.js";
const pluginRouter = express.Router();
pluginRouter.get("/", getPluginUseListController);
pluginRouter.get("/count", getPluginUseCountController);
export default pluginRouter;
