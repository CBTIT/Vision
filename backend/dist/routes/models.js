import { Router } from "express";
import { getModelHistory, getModelWarningsHistory, getModelWarningsOverview, listModels, } from "../controllers/modelsController.js";
const router = Router();
router.get("/model-warnings", getModelWarningsOverview);
/** @deprecated Same as /model-warnings; kept for older deployed clients. */
router.get("/project-warnings", getModelWarningsOverview);
router.get("/:modelId/warning-history", getModelWarningsHistory);
router.get("/:modelId/size-history", getModelHistory);
router.get("/", listModels);
export default router;
