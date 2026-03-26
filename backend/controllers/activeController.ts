import { Request, Response } from "express";
import {
  getActiveUsers,
  getActiveUsersCount,
} from "../services/heartbeatService.js";

export const getActiveUsersCountController = async (
  req: Request,
  res: Response,
) => {
  const activeCount = await getActiveUsersCount();
  return res.json({ activeUsersCount: activeCount });
};

export const getActiveUsersController = async (req: Request, reS: Response) => {
  const active = await getActiveUsers();
  return reS.json({ activeUsers: active });
};
