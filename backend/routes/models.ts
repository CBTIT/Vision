import { Router } from "express";
import { listModels } from "../controllers/modelsController.js";

const router = Router();

router.get("/", listModels);

export default router;
