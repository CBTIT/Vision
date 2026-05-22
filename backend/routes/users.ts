import express from "express";
import { getUsersSummaryController } from "../controllers/usersController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const usersRouter = express.Router();

usersRouter.use(authMiddleware);

usersRouter.get("/summary", getUsersSummaryController);

export default usersRouter;
