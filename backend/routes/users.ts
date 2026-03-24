import express from "express";
import { getActiveUsersCountController } from "../controllers/userController.js";
const userRouter = express.Router();

userRouter.get("/", (req, res) => {
  res.json({ message: "Get All Users" });
});
userRouter.get("/active-count", getActiveUsersCountController);

export default userRouter;
