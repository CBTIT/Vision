import { Router } from "express";
import { getModelHistory, listModels } from "../controllers/modelsController.js";

const router = Router();

router.get("/:modelId/size-history", getModelHistory);
router.get("/", listModels);

export default router;
