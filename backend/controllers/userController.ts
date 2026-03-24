import { Request, Response } from "express";
import { getActiveUsersCount } from "../services/heartbeatService.js";

export const getActiveUsersCountController = async (
  req: Request,
  res: Response,
) => {
  const activeCount = await getActiveUsersCount();
  return res.json({ activeUsers: activeCount });
};
