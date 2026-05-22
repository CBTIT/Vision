import express from "express";
import {
  getPluginUseCountController,
  getPluginNamesController,
  getPluginUseListController,
} from "../controllers/pluginController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const pluginRouter = express.Router();

pluginRouter.use(authMiddleware);

pluginRouter.get("/", getPluginUseListController);
pluginRouter.get("/names", getPluginNamesController);
pluginRouter.get("/count", getPluginUseCountController);

export default pluginRouter;
