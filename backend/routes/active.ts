import express from "express";
import {
  getActiveUsersController,
  getActiveUsersCountController,
} from "../controllers/activeController.js";
const userRouter = express.Router();

userRouter.get("/", (req, res) => {
  res.json({ message: "Get All Users" });
});
userRouter.get("/count", getActiveUsersCountController);
userRouter.get("/users", getActiveUsersController);

export default userRouter;
