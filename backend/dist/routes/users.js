import express from "express";
import { getUsersSummaryController } from "../controllers/usersController.js";
const usersRouter = express.Router();
usersRouter.get("/summary", getUsersSummaryController);
export default usersRouter;
