import { Request, Response } from "express";
import { getAllSyncsCount } from "../services/syncService.js";

export const getAllSyncsCountController = async (
  req: Request,
  res: Response,
) => {
  const syncsCount = await getAllSyncsCount();
  return res.json({ syncsCount: syncsCount });
};
