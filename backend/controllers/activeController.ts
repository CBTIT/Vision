import { Request, Response } from "express";
import {
  getActiveProjectUsers,
  getActiveProjects,
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

export const getActiveProjectsController = async (
  _req: Request,
  res: Response,
) => {
  const projects = await getActiveProjects();
  return res.json({ projects });
};

export const getActiveProjectUsersController = async (
  req: Request,
  res: Response,
) => {
  const raw = req.query.projectName;
  if (typeof raw !== "string") {
    return res.status(400).json({ error: "projectName query parameter required" });
  }
  const data = await getActiveProjectUsers(raw);
  return res.json(data);
};
