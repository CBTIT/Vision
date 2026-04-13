import { Router } from "express";
import { getModelHistory, getProjectWarnings, listModels, } from "../controllers/modelsController.js";
const router = Router();
router.get("/project-warnings", getProjectWarnings);
router.get("/:modelId/size-history", getModelHistory);
router.get("/", listModels);
export default router;
