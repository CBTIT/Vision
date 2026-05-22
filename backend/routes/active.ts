import express from "express";
import {
  getActiveProjectUsersController,
  getActiveProjectsController,
  getActiveUsersController,
  getActiveUsersCountController,
} from "../controllers/activeController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
const userRouter = express.Router();

userRouter.use(authMiddleware);

userRouter.get("/", (req, res) => {
  res.json({ message: "Get All Users" });
});
userRouter.get("/count", getActiveUsersCountController);
userRouter.get("/users", getActiveUsersController);
userRouter.get("/projects", getActiveProjectsController);
userRouter.get("/project-users", getActiveProjectUsersController);

export default userRouter;
